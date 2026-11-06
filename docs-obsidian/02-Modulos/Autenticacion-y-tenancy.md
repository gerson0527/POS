---
tags:
  - modulo/auth
  - modulo/tenancy
estado: documentada
ruta-codigo:
  - lib/auth.ts
  - lib/auth/session-context.ts
  - lib/auth/permissions.ts
  - lib/auth/actor.ts
  - app/actions/_shared.ts
  - proxy.ts
  - lib/db/index.ts
  - lib/db/tenant-connection.ts
  - lib/db/tenant-provisioner.ts
  - lib/db/schema/auth.ts
  - lib/db/schema/tenancy.ts
---

# Autenticación y tenancy

## Función y flujo

Better Auth autentica email/contraseña y persiste usuario, sesión y cuenta en PostgreSQL. `session-context.ts` obtiene el usuario, busca membresía activa en `user_tenant`, usa `tenant_id` como preferencia de empresa y valida rol. `requireActor()` agrupa `userId`, `tenantId` y rol para los servicios reutilizables por web y canales.

`proxy.ts` aplica un primer control de sesión a rutas protegidas. Las acciones vuelven a verificar permisos en servidor; el proxy no reemplaza esa autorización de dominio.

## Roles encontrados

`ADMIN`, `MANAGER`, `CASHIER`, `VIEWER`, `ACCOUNTANT`. El rol contable tiene acceso restringido a facturación; la gestión de usuarios se limita a ADMIN. Los permisos concretos están en `lib/auth/permissions.ts`, no solo en la navegación UI.

Better Auth configura sesiones de siete días, política de contraseña de 12 a 128 caracteres y limitación de intentos. El servidor falla al iniciar si falta `BETTER_AUTH_SECRET`.

## Aislamiento de empresa

Las tablas de negocio contienen `tenantId` y servicios consultados filtran por empresa. La base principal de la app se crea desde `lib/db/index.ts`. Hay utilidades para crear bases por slug, pero `getTenantDb()` no aparece usado desde otros archivos en la búsqueda hecha para esta documentación.

> [!question] Por verificar
> Confirmar el modelo de tenancy operativo y si debe aprovisionarse una base por empresa. Los comentarios de `tenant-connection.ts` hablan de PostgreSQL por tenant y una rama SQLite heredada; el runtime Tauri observado configura PostgreSQL privado local.

## Datos relacionados

- `user` se vincula explícitamente con `session` y `account` mediante `.references()` en el esquema.
- `user_tenant` representa la membresía empresa/usuario; el esquema declara unicidad de la pareja, no una FK Drizzle.
- Ver [[03-Datos/Modelo-de-datos]] y [[02-Modulos/Usuarios-y-configuracion]].
