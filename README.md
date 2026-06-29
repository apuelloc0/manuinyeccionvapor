# Manu — Backend (Inyección de Vapor)

API REST del sistema **Manu / SteamTrack** para gestión de operaciones de inyección de vapor: usuarios, macollas, pozos y registros diarios de producción.

**Stack:** Node.js 18+, Express 5, Supabase (PostgreSQL), JWT.

## Requisitos

- Node.js 18+
- Proyecto Supabase configurado con las tablas del sistema (`users`, `macollas`, `pozos`, `registros_diarios`, `audit_logs`, etc.)

## Instalación

```bash
pnpm install
# o: npm install
```

Crear un archivo `.env` en la raíz de `/back` con al menos:

```env
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key
JWT_SECRET=una_clave_secreta_larga

# Opcionales
PORT=4000
NODE_ENV=development
UPLOAD_PATH=./uploads
MAX_FILE_SIZE_MB=10

# Producción — protección anti-bots (Cloudflare Turnstile)
ENABLE_TURNSTILE=false
TURNSTILE_SECRET_KEY=
```

> Usa la **service role key** de Supabase en el backend, no la anon key.

## Uso

```bash
# Desarrollo (recarga automática)
pnpm run dev

# Producción
pnpm start
```

Crear usuario administrador inicial:

```bash
pnpm run seed
# Usuario: admin  |  Contraseña: adminpassword
```

El primer usuario registrado vía `/api/auth/register` también se activa automáticamente como **Administrador** si la tabla `users` está vacía. Los demás quedan pendientes de aprobación.

Servidor por defecto: `http://localhost:4000`

## Autenticación

Rutas protegidas requieren el header:

```
Authorization: Bearer <token>
```

El token JWT expira en **24 horas**.

### Autenticación (`/api/auth`)

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/api/auth/register` | No | Registro (email, password, full_name, security_questions) |
| POST | `/api/auth/login` | No | Login (username, password) |
| GET | `/api/auth/me` | Sí | Usuario autenticado actual |

En producción, login y registro pueden exigir `captchaToken` de Cloudflare Turnstile si `ENABLE_TURNSTILE=true`.

## Roles y permisos

| Rol | Descripción |
|-----|-------------|
| **Administrador** | Acceso total; gestión de usuarios, macollas y pozos |
| **Operador** | Carga de registros diarios |
| **Supervisor** | Carga y validación de registros |
| **Gerente** | Visualización de reportes e indicadores |
| **Consulta** | Solo lectura |
| **Seguridad** | Acceso acotado según configuración del front |

Permisos granulares definidos en `src/config/constants.js` (`OPERACIONES_CARGA`, `REPORTES_FULL`, etc.).

## API expuesta

Base URL: `http://localhost:4000/api`

### Usuarios (`/api/users`)

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/verify-username/:username` | No | Verificar si existe un correo |
| POST | `/verify-security-answers` | No | Validar respuestas de seguridad |
| POST | `/reset-password` | No | Restablecer contraseña |
| GET | `/` | Admin | Listar usuarios |
| GET | `/audit` | Admin | Bitácora de auditoría (últimos 100 registros) |
| GET | `/:id` | Admin | Detalle de usuario |
| POST | `/` | Admin | Crear usuario |
| PATCH | `/:id` | Admin | Actualizar usuario (p. ej. activar cuenta) |
| DELETE | `/:id` | Admin | Eliminar usuario |

### Macollas y pozos

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/api/macollas` | Sí | Listar macollas con sus pozos |
| POST | `/api/macollas` | Admin | Crear macolla |
| PUT | `/api/macollas/:id` | Admin | Actualizar macolla |
| DELETE | `/api/macollas/:id` | Admin | Eliminar macolla |
| GET | `/api/pozos?macollaId=` | Sí | Listar pozos (filtro opcional por macolla) |
| POST | `/api/pozos` | Admin | Crear pozo |
| PUT | `/api/pozos/:id` | Admin | Actualizar pozo |
| DELETE | `/api/pozos/:id` | Admin | Eliminar pozo |

Estatus de pozo: `En inyección`, `En espera`, `En mantenimiento`.

### Registros diarios de producción (`/api/production-logs`)

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/` | Sí | Listar registros (incluye `vapor_total` y `calidad_promedio` calculados) |
| POST | `/` | Operador+ | Crear registro diario |

Campos principales del body en `POST`: `pozo_id`, `fecha`, `hora`, `turno`, `operador_nombre`, parámetros de generadores (`gv1_*`, `gv3_*`), niveles de tanques, `bitacora`, `horas_perdidas`, `causa_downtime`, `estatus`.

## Estructura del proyecto

```
src/
  config/        # db (Supabase), constants, upload
  controllers/   # Lógica de negocio por módulo
  middleware/    # auth, validate, errorHandler
  models/        # Constantes de tablas Supabase
  routes/        # Definición de rutas
  services/      # Auditoría y servicios compartidos
  utils/
  validators/
  app.js
  server.js
scripts/
  seed-admin.js
uploads/         # Archivos subidos (si aplica)
```

## Tablas principales (Supabase)

- **users** — username (email), password, full_name, role, active, security_questions
- **macollas** — nombre, ubicacion
- **pozos** — macolla_id, numero, estatus, ciclo_inicio, ciclo_fin, vapor_acumulado_ton
- **registros_diarios** — parámetros operacionales, producción de vapor, bitácora, downtime
- **audit_logs** — trazabilidad de acciones (CREATE, UPDATE, DELETE)

## Módulos en código (aún no montados en `routes/index.js`)

Existen controladores y rutas para inventario, clientes, dashboard, reportes PDF y steam-reports. Están preparados para integrarse, pero **no forman parte de la API activa** hasta registrarlos en `src/routes/index.js`.

## Frontend

El cliente web vive en `/front` (React + TanStack Router). Configura `VITE_API_BASE_URL=http://localhost:4000/api` en el `.env` del front.
