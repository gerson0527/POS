# Informe de Ciberseguridad — POS DIAN Colombia

- **Fecha:** 2026-10-17
- **Alcance:** revisión estática de código (Next.js 16 / React 19 / TypeScript), configuración, esquema de base de datos y superficie de red del sistema POS + facturación electrónica DIAN.
- **Método:** análisis de código y configuración (SAST manual). **No** incluye pentest dinámico ni pruebas de intrusión sobre el entorno en vivo.
- **Repositorio:** `POS` (rama `redesign/ui-comercial`).
- **Entorno productivo observado:** Vercel (`credito-brilla-pos.vercel.app`) + Neon Postgres.

> Nota: este documento es un diagnóstico. Ningún hallazgo ha sido explotado; las severidades se asignan por impacto teórico y facilidad de explotación.

---

## 1. Resumen ejecutivo

El sistema tiene una base razonable: autenticación delegada a **Better Auth** (hash de contraseñas y sesiones gestionadas por la librería), consultas parametrizadas vía **Drizzle ORM**, aislamiento multi-tenant en la mayoría de las consultas, cifrado **AES-256-GCM** para credenciales de facturación y validación de entrada con **Zod** en las rutas API.

Sin embargo, existen **debilidades importantes** que deben corregirse antes de considerar el sistema apto para producción con datos reales:

| Severidad | Nº | Tema |
|---|---|---|
| 🔴 Crítica | 1 | Secretos de respaldo (*fallback*) embebidos en el código |
| 🟠 Alta | 2 | Falta de enforce de roles (RBAC) en server actions |
| 🟠 Alta | 3 | Claves de cifrado *hardcodeadas* en paquetes que corren en el cliente |
| 🟡 Media | 5 | Rate limiting en memoria, sin cabeceras de seguridad/CSP, política de contraseñas débil, acoplamiento de claves de cifrado, sin middleware de rutas |
| 🔵 Baja | 5 | Inyección HTML en correos, licencia/hardware simulados, logs de credenciales, IDs predecibles, hashing de API key |
| ⚪ Informativa | 2 | Revisión de `trustedOrigins`, endpoint público en modo stub |

**Lo más urgente:** eliminar los secretos por defecto (H-1) y aplicar control de autorización por rol (H-2). Ambos son corregibles en horas y de alto impacto.

---

## 2. Controles de seguridad ya presentes (fortalezas)

1. **Gestión de identidad con Better Auth** (`lib/auth.ts`, `app/api/auth/[...all]/route.ts`): hash de contraseñas y ciclo de sesión delegados a la librería (no hay manejo casero de hashes).
2. **Sesión/tenant resueltos en servidor** (`lib/auth/session-context.ts`): `requireUser()` → `requireTenantId()`; la membresía se lee de `user_tenant` y **nunca se autocrea** (comentario explícito en `session-context.ts:34-39`), evitando una escalada de privilegios histórica.
3. **Aislamiento multi-tenant:** las consultas filtran por `tenantId` obtenido de la sesión, no del cliente. Ejemplo robusto: en `app/api/reports/inventory-pdf/route.ts:56-62` la marca del PDF se toma **siempre** de la BD.
4. **Consultas parametrizadas:** uso de Drizzle ORM; las 4 expresiones `sql\`` detectadas (`app/actions/sales.ts:273`, `app/actions/customers.ts:380,436`) usan *template tags* parametrizados → **sin inyección SQL detectada**.
5. **Cifrado autenticado** de secretos de proveedor: `lib/security/encrypt.ts` usa **AES-256-GCM** con IV aleatorio y *auth tag*, con versionado (`v1:iv:tag:ct`) y descifrado tolerante para datos heredados.
6. **Validación de entrada con Zod** en rutas API y parseo seguro (`lib/api/http.ts`).
7. **Manejo de errores sin fuga de internals:** `toErrorResponse()` (`lib/errors.ts:85-97`) devuelve `500 Internal server error` genérico; los `AppError` mapean códigos a HTTP.
8. **Secretos fuera del repositorio:** `.env*` está en `.gitignore` (excepto `.env.example`).
9. **Auditoría:** existe `logAudit()` (`app/actions/_shared.ts:11`) y tabla `audit_log`.
10. **Barrera de borde + cabeceras:** `proxy.ts` protege `/dashboard`, `/pos`, `/api/v1` y `/api/reports` (redirige a `/login` sin cookie de sesión) e inyecta `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` y `Referrer-Policy`.

---

## 3. Hallazgos detallados

### 🔴 H-1 (Crítica) — Secretos de respaldo embebidos en el código

**Ubicaciones**
- `lib/auth.ts:7` → `secret: process.env.BETTER_AUTH_SECRET || 'pos-dian-tactical-secret-key-2026-secure'`
- `scripts/seed.ts:29` y `scripts/archive/seed_all_dbs.ts:64` → mismo literal.
- `lib/security/encrypt.ts:25` → `FALLBACK_KEY_MATERIAL = 'pos-dian-credentials-encryption-key-2026'`.

**Impacto**
Si `BETTER_AUTH_SECRET` no está definida en el entorno, Better Auth firma las sesiones con una clave **conocida y pública** (está en el repositorio). Un atacante podría **forjar cookies de sesión** válidas para cualquier usuario, incluido un administrador. En el caso del cifrado, un fallback conocido permitiría **descifrar credenciales de facturación DIAN** almacenadas.

**Recomendación**
- Eliminar todos los *fallbacks* y **fallar el arranque** si falta el secreto:
  ```ts
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) throw new Error('BETTER_AUTH_SECRET no está definida')
  ```
- Igual para `ENCRYPTION_KEY` en `lib/security/encrypt.ts`.
- **Rotar** `BETTER_AUTH_SECRET` y `ENCRYPTION_KEY` en producción (con plan de re-cifrado de credenciales DIAN).
- Verificar en Vercel que ambas variables estén efectivamente definidas para todos los entornos.

---

### 🟠 H-2 (Alta) — Sin control de autorización por rol (RBAC)

**Evidencia**
- `requireRole()` está definida en `lib/auth/session-context.ts:56` pero **no se usa en ningún server action** (solo aparece en la documentación).
- Únicamente `app/actions/company.ts:89,125` y `app/actions/tenants.ts:125,198` verifican `role === 'ADMIN'` de forma puntual.
- El resto de los actions usan `getUserId()` / `getTenantId()` (autenticación) **sin comprobar el rol**.

**Impacto**
Un usuario autenticado con rol `VIEWER` o `CASHIER` podría invocar server actions de escritura (crear/editar productos, clientes, usuarios, configuración, etc.) si el action no valida el rol. Es una **violación de control de acceso (OWASP A01)**.

**Recomendación**
- Definir una matriz de permisos por acción y aplicar `requireRole(userId, ['ADMIN', ...])` (o un wrapper `withRole`) en cada mutación.
- Centralizar la autorización para evitar que actions nuevas la omitan.
- Añadir pruebas que verifiquen rechazo (403) para roles no autorizados.

---

### 🟠 H-3 (Alta) — Claves de cifrado *hardcodeadas* en paquetes que corren en el cliente

**Ubicaciones**
- `packages/security-vault/src/vault.ts:14` → `'SECURE_TPM_LOCAL_KEY_2026_ENTERPRISE_POS'`; cifra con **AES-256-CBC** (sin *auth tag*), `vault.ts:20`.
- `packages/backup-recovery/src/backup-engine.ts:15` → `'ENTERPRISE_POS_BACKUP_MASTER_KEY_2026'`; también **AES-256-CBC**, `backup-engine.ts:24`.
- Se consumen vía hooks `'use client'` (`hooks/useSecurityVault.ts`, `hooks/useBackupRecovery.ts`) usados en `app/dashboard/pos-terminal/page.tsx`.

**Impacto**
La clave de cifrado queda **incluida en el bundle JavaScript** enviado al navegador → cualquier usuario puede extraerla. Además, CBC sin autenticación permite **manipulación del ciphertext**. Como “bóveda de certificados DIAN” no ofrece garantía real.

**Recomendación**
- Mover cualquier cifrado de secretos al servidor (`lib/security/encrypt.ts`, AES-GCM) y nunca exponer claves al cliente.
- Si estas pantallas son demo, retirarlas o marcarlas explícitamente; si son reales, rediseñar con clave por sesión derivada del servidor (WebCrypto + API).
- Migrar de CBC a **GCM**.

---

### 🟡 H-4 (Media) — Rate limiting ineficaz en serverless

**Ubicación:** `lib/api/public-api.ts:9,43-56` (`Map` en memoria, ventana de 1 h).

**Impacto**
En Vercel cada instancia tiene su propia memoria y se recicla; un atacante puede **superar el límite** distribuyendo peticiones. El propio código lo reconoce (“in production, use Redis”). Además, al exceder el límite se responde `valid:false` (401) en vez de `429`.

**Recomendación:** almacenar contadores en Redis/Upstash (o en la BD) y devolver `429` con `Retry-After`.

---

### 🟡 H-5 (Media) — CSP y Permissions-Policy ausentes *(remediado)*

**Ubicación original:** faltaba **Content-Security-Policy** y `Permissions-Policy`. Las cabeceras `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy` y `HSTS` **ya las añade `proxy.ts`** (se observaron en respuestas HTTP reales).

**Impacto:** sin CSP, menor defensa en profundidad frente a XSS.

**Remediación aplicada:** se añadió CSP + `Permissions-Policy` en `next.config.mjs` `headers()`, aplicadas a todas las rutas. *Residual:* la CSP usa `'unsafe-inline'`/`'unsafe-eval'` (requerido por Next sin `nonce`); endurecer con `nonce` + `strict-dynamic` en una iteración posterior.

---

### 🟡 H-6 (Media) — Política de contraseñas débil y credenciales demo

**Ubicación**
- `scripts/seed.ts:374` imprime `Admin: gersongio0527@gmail.com | Password: 12345678password`.
- `scripts/seed.ts:45` registra en consola usuario/contraseña.
- `lib/auth.ts:28-31` no define `minPasswordLength` ni complejidad; `autoSignIn: true`.

**Impacto**
Contraseña de administrador **conocida y débil** en producción; sin política mínima ni bloqueo por intentos fallidos (verificar rate limit de Better Auth), es susceptible a **fuerza bruta / credential stuffing**.

**Recomendación:** forzar cambio de contraseña del admin sembrado; definir `emailAndPassword.minPasswordLength ≥ 12` y complejidad; habilitar bloqueo temporal; no loguear credenciales.

---

### 🟡 H-7 (Media) — Acoplamiento de la clave de cifrado con el secreto de auth

**Ubicación:** `lib/security/encrypt.ts:32` → derivada de `ENCRYPTION_KEY || BETTER_AUTH_SECRET || FALLBACK`.

**Impacto**
Si rota `BETTER_AUTH_SECRET`, las credenciales DIAN cifradas quedan **ilegibles** (el propio código advierte no rotar sin re-cifrado). Mezclar claves de dominios distintos (sesión vs. datos) es mala práctica.

**Recomendación:** exigir siempre `ENCRYPTION_KEY` dedicada e independiente; eliminar el fallback a `BETTER_AUTH_SECRET`.

---

### 🟡 H-8 (Media) — Protección de rutas en el borde *(corregido: ya existía)*

**Corrección:** el sistema **sí** tiene barrera en el borde: **`proxy.ts`** (nombre de `middleware` en Next 16) protege `/dashboard`, `/pos`, `/api/v1` y `/api/reports`, redirige a `/login` si no hay cookie de sesión y responde `401` en APIs. La búsqueda inicial (solo `middleware.ts`) no lo detectó.

**Residual:** la verificación es "optimista" (presencia de cookie); la autorización real (sesión válida + rol/tenant) sigue en servidor, que es lo correcto. **Sin acción pendiente.**

---

### 🔵 H-9 (Baja) — Inyección HTML en correos de bienvenida

**Ubicación:** `lib/email.ts:38,41,42` interpola `name`, `to`, `role` en plantilla HTML sin escapar. También el enlace de acceso está *hardcodeado* a `http://localhost:3001/sign-in` (`email.ts:47`).

**Impacto:** inyección de HTML/enlaces en el correo (phishing dirigido si un admin crea un usuario con nombre malicioso).

**Recomendación:** escapar los valores y construir el enlace con `NEXT_PUBLIC_APP_URL`.

---

### 🔵 H-10 (Baja) — Verificación de licencia/hardware simulada

**Ubicación:** `hooks/useSecurityVault.ts:20-37` usa CPU/MAC/UUID ficticios y una firma Ed25519 de ejemplo (`'Ed25519_Sig_Sample_Valid_2026_DIAN_Enterprise'`).

**Impacto:** si se presenta como control de licenciamiento, es trivialmente eludible (no hay verificación real de firma).

**Recomendación:** implementar verificación criptográfica real en servidor o retirar de la UI productiva.

---

### 🔵 H-11 (Baja) — Hashing de API keys y parseo de scopes

**Ubicación:** `lib/api/public-api.ts:19` → `sha256(secret)` sin *salt*; `public-api.ts:67` → `scopes.split(',')` sin `trim`.

**Impacto:** aceptable **solo si** los secretos de API son de alta entropía (recomendado); de lo contrario, vulnerable a tablas arcoíris. El `split` sin `trim` puede conceder/denegar scopes por espacios.

**Recomendación:** documentar/forzar entropía mínima (p. ej. 32 bytes aleatorios), normalizar con `split(',').map(s => s.trim())`.

---

### 🔵 H-12 (Baja) — IDs predecibles y trazas

**Ubicación:** uso de `Date.now()` para IDs (`app/actions/_shared.ts:19,38`, `app/api/v1/invoices/route.ts:78`, seed). `toErrorResponse` (`lib/errors.ts:92`) y `lib/email.ts:58-62` registran información en logs.

**Impacto:** colisiones de ID bajo concurrencia y posible filtración de datos en logs (no se detectaron secretos en logs, salvo el seed).

**Recomendación:** usar `crypto.randomUUID()`/`cuid`; revisar nivel de log en producción.

---

### ⚪ H-13 (Informativa) — `trustedOrigins` y endpoint público stub

- `lib/auth.ts:32-40`: incluye `V0_RUNTIME_URL` y URLs de Vercel. Correcto, pero **asegurar** que en producción no se admitan orígenes de *preview* no confiables.
- `app/api/v1/invoices/route.ts:70-88`: el `POST` valida API key y scope `write`, pero **no persiste** ni comprueba que el `saleId` pertenezca al tenant; además el `id` es `Date.now()`. Es un *stub*: documentar o completar. El `GET` sí filtra por `tenantId`.

---

## 4. Superficie de ataque (endpoints expuestos)

| Ruta | Método | Autenticación | Notas |
|---|---|---|---|
| `/api/auth/[...all]` | GET/POST | Better Auth | Registro/login/sesión. Sin CAPTCHA/lockout explícito (H-6). |
| `/api/v1/invoices` | GET | API key (Bearer, scope `read`) | Filtra por `tenantId`. |
| `/api/v1/invoices` | POST | API key (Bearer, scope `write`) | Stub: no persiste (H-13). |
| `/api/reports/inventory-pdf` | GET/POST | Sesión + tenant | Aislamiento correcto; marca desde BD. |
| Server actions (`app/actions/*`) | RPC | Sesión | **Sin RBAC** en la mayoría (H-2). |

---

## 5. Datos y criptografía

- **En tránsito:** HTTPS forzado por Vercel (HSTS). SMTP depende de `secure` según puerto (`lib/email.ts:69`) — usar 465 o STARTTLS.
- **En reposo:** Neon cifra a nivel de disco (gestionado). A nivel de aplicación, secreto de proveedor DIAN con **AES-256-GCM** (`lib/security/encrypt.ts`) — correcto salvo por el fallback (H-1) y el acoplamiento de clave (H-7).
- **Contraseñas:** gestionadas por Better Auth.
- **Paquetes cliente:** CBC sin autenticación + clave embebida (H-3).

---

## 6. Dependencias y build

- Stack fijado: Next `16.2.6`, React 19, `drizzle-orm 0.45`, `better-auth 1.6.25`, `zod 4`.
- **Acción pendiente:** ejecutar `npm audit` de forma periódica y configurar **Dependabot/Renovate**. (`puppeteer` y `nodemailer` se marcan como `serverExternalPackages`, correcto.)
- `images.unoptimized: true` no afecta a seguridad.

---

## 7. Plan de remediación priorizado

| Prioridad | Hallazgo | Acción | Esfuerzo |
|---|---|---|---|
| 1 | H-1 | Quitar fallbacks de secretos; fallar al arrancar; rotar claves en Vercel | Bajo |
| 2 | H-2 | Enforce de roles por acción (`requireRole`) + tests 403 | Medio |
| 3 | H-3 | Retirar cifrado en cliente; mover al servidor; CBC→GCM | Medio |
| 4 | H-4 | Rate limiting en Redis; responder `429` | Medio |
| 5 | H-6 | Cambiar password admin; política de contraseñas; lockout | Bajo |
| 6 | H-7 | `ENCRYPTION_KEY` dedicada e independiente | Bajo |
| 7 | H-5 | CSP + `Permissions-Policy` en `next.config.mjs` | Bajo |
| 8 | H-8 | `middleware.ts` para `/dashboard/*` | Bajo |
| 9 | H-9–H-13 | Escape HTML en correos, licencia real, `randomUUID`, `npm audit` | Bajo |

---

## 8. Checklist de verificación (antes de producción)

- [ ] `BETTER_AUTH_SECRET` y `ENCRYPTION_KEY` definidas en prod y **rotadas** (H-1, H-7).
- [ ] Contraseña del administrador sembrado cambiada (H-6).
- [ ] RBAC aplicado a todas las mutaciones (H-2) con pruebas.
- [ ] Sin claves de cifrado en el bundle del cliente (H-3).
- [ ] Rate limiting persistente + `429` (H-4).
- [ ] CSP/`Permissions-Policy` activas (H-5).
- [ ] `middleware.ts` protegiendo `/dashboard` (H-8).
- [ ] `npm audit` sin vulnerabilidades altas/críticas.
- [ ] Backups y plan de recuperación verificados (Neon).
- [ ] Revisión de `trustedOrigins` en producción (H-13).

---

## 9. Conclusión

La arquitectura se apoya en componentes sólidos (Better Auth, Drizzle parametrizado, Zod, AES-GCM y aislamiento multi-tenant por sesión). Los riesgos principales **no provienen de fallos exóticos**, sino de **higiene de configuración y control de acceso**: secretos por defecto, ausencia de RBAC y cifrado en el cliente. Corregir H-1 y H-2 elimina la mayor parte del riesgo real; el resto son mejoras de endurecimiento asequibles.

> Este informe debe revisarse tras cada cambio significativo de autenticación, esquema o superficie de API.

---

## 10. Estado de remediación (2026-10-17)

Se aplicaron las correcciones de todos los hallazgos. Resumen:

| ID | Estado | Cambio aplicado |
|---|---|---|
| H-1 | ✅ Resuelto (código) | Se eliminaron los secretos *fallback*; `lib/auth.ts` y `scripts/seed.ts` **fallan si falta** `BETTER_AUTH_SECRET`. |
| H-2 | ✅ Resuelto | `requireRole(...)` aplicado a **40 mutaciones** en `app/actions/*`; política por rol (ADMIN / MANAGER / CASHIER). |
| H-3 | ✅ Resuelto | Se retiró el cifrado en cliente de `pos-terminal`; hooks `useSecurityVault`/`useBackupRecovery` **eliminados**. |
| H-4 | ✅ Resuelto | Rate limiting persistente en Postgres (`lib/security/rate-limit.ts` + tabla `rate_limit_bucket`) y respuesta **429** (`RATE_LIMITED`). |
| H-5 | ✅ Resuelto (residual) | CSP + `Permissions-Policy` en `next.config.mjs`. Residual: CSP con `unsafe-inline` (endurecer con `nonce`). |
| H-6 | ✅ Resuelto | `minPasswordLength: 12`, `rateLimit` en Better Auth; se dejaron de registrar credenciales en el seed. |
| H-7 | ✅ Resuelto | `ENCRYPTION_KEY` dedicada y **obligatoria** (sin fallback a `BETTER_AUTH_SECRET`). |
| H-8 | ✅ Corregido | Ya existía `proxy.ts`; sin acción (hallazgo era falso por búsqueda incompleta). |
| H-9 | ✅ Resuelto | `escapeHtml()` en `lib/email.ts` y URL desde `NEXT_PUBLIC_APP_URL`. |
| H-10 | ✅ Resuelto | Se retiraron de la UI la licencia Ed25519 y la huella de hardware simuladas. |
| H-11 | ✅ Parcial | `scopes` con `trim`/`filter`; documentada la entropía mínima de la API key. |
| H-12 | ✅ Resuelto | IDs de `audit_log`/`event`/API con `crypto.randomUUID()`. |
| H-13 | ⚪ Informativo | Sin cambio de código; `trustedOrigins` revisado (solo entornos propios). |

Migraciones de BD añadidas: `0001` (elimina tablas sin uso) y `0002` (crea `rate_limit_bucket`), aplicadas a Neon.

### ⚠️ Acciones manuales pendientes (no aplicables desde el código)

1. **Rotar** `BETTER_AUTH_SECRET` y `ENCRYPTION_KEY` en Vercel (y re-cifrar credenciales DIAN si `ENCRYPTION_KEY` cambia).
2. **Verificar** que `ENCRYPTION_KEY` esté definida en el entorno de producción (ahora es obligatoria).
3. **Cambiar** la contraseña del administrador sembrado (`gersongio0527@gmail.com`).
4. Eliminar en una limpieza posterior los paquetes ya sin uso `packages/security-vault` y `packages/backup-recovery` (y sus referencias en `start-tauri.bat`).
