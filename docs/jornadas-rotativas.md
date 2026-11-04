# Jornadas fijas y rotativas

## Compatibilidad y datos

`employees.schedule_type` se agrega con `FIXED` como valor predeterminado. La migración
`prisma/migrations/20261104155100_rotating_employee_schedules/migration.sql` no cambia
la entrada, salida ni horas semanales existentes. Los nuevos catálogos y calendarios
usan UUID para mantener el estándar del schema existente.

Antes de desplegar:

1. Respaldar la base de datos y aplicar la migración en staging con `npm run db:migrate-schedules`.
2. Verificar que la migración insertó las franjas y plantillas base.
3. Generar el cliente Prisma y validar asistencia, planilla y alta de empleados fijos.
4. Verificar los datos existentes (`schedule_type = 'FIXED'`) antes de producción.

No usar `npm run setup` como sustituto de esta migración: ese comando ejecuta `db push`
con aceptación de pérdida de datos.

## Patrones incluidos

- **Rotativo 5x2 diurno:** cinco turnos de 08:00 a 17:00 con una hora de descanso,
  seguidos de dos días libres.
- **Semana A/B diurna y nocturna:** cinco turnos diurnos y dos descansos, seguidos de
  cinco turnos nocturnos de 19:00 a 03:00 y dos descansos.

La fecha inicial define el día 1 del ciclo. Se proyectan los próximos 30 días desde la
fecha local actual, respetando la fase del ciclo. El preview permite cambiar fechas
concretas sin editar la plantilla; `NULL` en `employee_rosters.shift_id` significa
descanso. Los ajustes permanecen al regenerar la proyección.

## Reglas aplicadas

- Las horas netas restan el descanso configurado.
- Una franja con más de cuatro horas dentro de 19:00–06:00 se clasifica como nocturna.
- Límites predeterminados: 8 horas diurnas por día, 44 por ventana móvil de siete días;
  7 nocturnas por día y 39 por ventana móvil de siete días.
- Se exige un mínimo de ocho horas continuas entre franjas. La configuración admite
  aumentarlo, nunca reducirlo por debajo de ocho.
- No se permite más de una asignación diaria por persona. Las franjas consecutivas
  también se validan para impedir solapamientos y descansos insuficientes.

Estos valores corresponden a los requisitos funcionales definidos para este sistema;
deben confirmarse con asesoría laboral antes de usarse como interpretación legal.

## API

### `POST /api/v1/employees`

Requiere permiso de gestión del equipo y acepta los campos tradicionales del empleado,
más `scheduleType`, `schedulePatternId`, `scheduleAnchorDate` y opcionalmente
`rosterOverrides` (objeto `YYYY-MM-DD` a UUID de franja o `null`). Para `FIXED`, los
campos de entrada, salida y horas semanales mantienen el flujo actual. Para `ROTATING`,
se validan el patrón y los ajustes y se proyectan 30 días dentro de la misma transacción.

Devuelve `{ "id": "..." }`; responde 201 al crear y 200 al actualizar. Las validaciones
responden 400, permisos 403 y conflictos de datos 409.

### `GET /api/v1/employees/{id}/roster?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD`

Requiere `team:manage`. Devuelve la persona y las asignaciones persistidas en el rango,
con máximo de 90 días, incluyendo `shift`, `isRestDay` e `isOverride`.

## Resolución de jornada

`getEmployeeDailySchedule(employeeId, date)` y su variante batched son el acceso unificado
del servidor. Para personal fijo devuelven la regla estática; para personal rotativo
resuelven primero la asignación proyectada y, si aún no existe, calculan el día a partir
del patrón. Asistencia y planilla usan esta resolución para mostrar el turno y calcular
horas nocturnas, ordinarias y extras.

## Interfaz

El alta conserva **Horario fijo** como opción predeterminada, con sus mismos campos.
**Horario rotativo / variable** despliega en 200 ms el selector de plantilla, fecha de
inicio, ciclo visual por día, ajustes puntuales y promedio semanal con advertencia de
límite. En asistencia se muestra el turno del día y se bloquea el marcaje de entrada en
un día de descanso.
