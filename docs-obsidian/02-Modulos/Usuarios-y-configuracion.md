---
tags:
  - modulo/usuarios
  - modulo/configuracion
estado: documentada
ruta-codigo:
  - app/dashboard/users/
  - app/dashboard/settings/
  - app/actions/users.ts
  - app/actions/company.ts
  - app/actions/locations.ts
  - app/actions/factus-config.ts
  - lib/auth/permissions.ts
  - lib/db/schema/tenancy.ts
---

# Usuarios y configuración

## Usuarios y acceso

El listado y mantenimiento de operadores se realiza desde `/dashboard/users`. `createUserAction()` está restringida a ADMIN, valida correo/nombre/contraseña mínima de 12 caracteres y rol permitido, crea usuario/cuenta/membresía en una transacción, intenta enviar correo de bienvenida y audita la acción. Roles aceptados incluyen ADMIN, MANAGER, CASHIER, VIEWER y ACCOUNTANT.

`getMyAccess()` entrega rol, ruta inicial y permisos al layout del dashboard. La contadora se limita a facturas; solo ADMIN gestiona usuarios.

## Empresa y preferencias

`app/actions/company.ts` lee/actualiza datos legales y de contacto, onboarding, modo fiscal y plazo de crédito. Las credenciales sensibles DIAN no se devuelven al cliente; se informa si existen. Factus se administra desde acción dedicada: [[02-Modulos/Facturacion-Factus-y-DIAN]].

La configuración incluye sedes (modelo `location`), datos fiscales de emisor, plazo de crédito y modo `AUTO`/`MANUAL`. El UI de ajustes puede enlazar secciones de backup y asistente.

## Referencias

Véase [[02-Modulos/Autenticacion-y-tenancy]], [[02-Modulos/Clientes-y-credito]] y [[02-Modulos/Backup]].
