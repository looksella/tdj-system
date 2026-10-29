# Buen Negocio

Sistema de gestión comercial construido con Next.js, Prisma, PostgreSQL y Supabase Auth.

## Requisitos

- Node.js 22 o superior.
- Un proyecto Supabase con PostgreSQL y Authentication habilitados.

## Configuración local

1. Crea un proyecto en Supabase.
2. En **Project Settings → API**, copia el **Project URL**, la clave pública (`anon` o `publishable`) y la clave privada de servidor (`service_role` o `secret`).
3. En **Connect**, copia una URI PostgreSQL. Usa la conexión directa o **Session pooler** para el desarrollo local.
4. Crea un archivo `.env` en la raíz del proyecto:

```env
DATABASE_URL="URI_POSTGRESQL"
DIRECT_DATABASE_URL="URI_DIRECTA_O_SESSION_POOLER"
NEXT_PUBLIC_SUPABASE_URL="URL_DEL_PROYECTO"
NEXT_PUBLIC_SUPABASE_ANON_KEY="CLAVE_PUBLICA"
SUPABASE_SERVICE_ROLE_KEY="CLAVE_PRIVADA_DE_SERVIDOR"
```

No publiques `.env` ni compartas la clave privada. La clave privada solo debe usarse en procesos de servidor.

5. En Supabase, abre **Authentication → URL Configuration**. Define **Site URL** como `http://localhost:3000` y agrega `http://localhost:3000/**` a **Redirect URLs**. En producción, agrega también el dominio publicado.

6. Instala dependencias y prepara la base:

```powershell
npm install
npm run setup
npm run seed
```

7. Crea tu cuenta exclusiva de desarrolladora y la cuenta inicial de administrador:

```powershell
npm run create-developer
npm run create-admin
```

Cada comando solicita el correo y la contraseña en la terminal; la contraseña no se muestra ni se guarda en el repositorio. La cuenta `developer` se reserva para ti, no puede invitarse desde la aplicación y el comando impide crear una segunda cuenta con ese rol. Usa la clave privada de Supabase solo en tu entorno local para este paso.

8. Inicia el servidor:

```powershell
npm run dev
```

Abre `http://localhost:3000/sign-in` e inicia sesión con la cuenta correspondiente. Desde **Usuarios**, los administradores pueden invitar otras cuentas de administrador o de empleado.

### Qué ve cada rol

| Herramienta | Empleado | Administrador |
| --- | --- | --- |
| Inventario, punto de venta | ✅ | ✅ |
| Caja del turno (apertura, movimientos, arqueo ciego) | ✅ solo su turno | ✅ todos los turnos |
| Asistencia (marcaje por PIN) | ✅ solo su ficha | ✅ cualquier ficha |
| Corregir marcajes y tolerancia | — | ✅ |
| Planilla, salarios, deducciones y recibos | — | ✅ |
| Personas, horarios, PIN y correo de la cuenta | — | ✅ |

El empleado queda ligado a su ficha por el **correo de su cuenta**: se escribe al crear la persona en **Planilla → Personas y condiciones**. Sin ese correo, la cuenta de empleado puede cobrar ventas pero no abrir caja ni marcar asistencia, porque no hay a quién atribuir el turno.

El reparto vive en `lib/auth-helpers.ts` (`PERMISSIONS` y `PERMISOS_TURNO`) y se aplica en tres capas: el menú, la guarda de la página y cada Server Action en `lib/actions/operations.ts`.

Las funciones opcionales de asistente, lectura de archivos, correo y calendario requieren configurar `BEON_TOOLS_URL` y `BEON_TOOLS_API_KEY` para un servicio compatible. La app de ventas e inventario no requiere esas variables. Para almacenamiento de imágenes, configura además `NEXT_PUBLIC_SUPABASE_BUCKET` y crea ese bucket en Supabase Storage.

## Nota sobre la base de datos

`npm run setup` sincroniza el esquema de Prisma en la base configurada; úsalo solo de forma consciente y con respaldo si la base ya contiene datos. `npm run build` genera el cliente Prisma y compila Next.js, sin conectarse ni modificar la base de datos.

En Vercel, configura `DATABASE_URL` y `DIRECT_DATABASE_URL` en **Settings → Environment Variables** para los entornos que usarán la aplicación:

- `DATABASE_URL`: usa la cadena **Transaction pooler** de Supabase (puerto `6543`) para las funciones serverless. Agrega `pgbouncer=true` a la cadena; si ya tiene parámetros, usa `&pgbouncer=true`.
- `DIRECT_DATABASE_URL`: usa la cadena **Session pooler** (puerto `5432`) o una conexión directa accesible desde el entorno donde ejecutarás `npm run setup`. El host directo `db.<project-ref>.supabase.co:5432` puede no aceptar conexiones desde redes IPv4 sin el complemento IPv4.

Obtén ambas cadenas en Supabase → **Connect**; no construyas manualmente el host o el usuario del pooler. Reemplaza el marcador de contraseña, codificando caracteres especiales de la contraseña en la URI, y no publiques estas cadenas. Los cambios de esquema se aplican por separado con `npm run setup` desde un entorno que pueda acceder a PostgreSQL; no durante el build.
