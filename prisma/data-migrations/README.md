# Migraciones de datos
Acá viven las **transformaciones de datos** de este sistema: mover un campo a
otra tabla, renombrarlo, derivar una columna nueva a partir de una vieja.
Un cambio de schema tiene dos mitades. `prisma/schema.prisma` describe la
**estructura** y viaja sola. Lo que hay que hacerle a los datos que ya estaban
cargados es la otra mitad, y sin un archivo acá esa mitad no viaja a ningún
lado: se queda en la base de construcción y el sistema publicado del dueño
recibe la columna nueva vacía.
## El contrato
Un archivo por transformación:
```
20260824T1530__mover_envio_a_linea.sql
└──────┬─────┘  └────────┬──────────┘
  timestamp UTC        slug
```
- **El timestamp da el orden de aplicación.** Lexicográfico = cronológico.
- **SQL plano.** Nada de TypeScript: no hace falta runtime de Node para
  correrlo y se lee en un code review.
- **Idempotente.** Correr el archivo dos veces no puede duplicar ni romper. Es
  la defensa en profundidad si una base ya recibió la transformación por otro
  camino.
- **Un archivo ya aplicado no se edita.** Si cambia de contenido después de
  haber corrido en algún lado, el aplicador falla ruidoso y no re-aplica.
  Corregir se corrige con una migración nueva.
## Cómo se aplica
En la base de construcción, vos:
```
npx prisma db execute --url $DATABASE_URL --file prisma/data-migrations/<archivo>.sql
```
En la base publicada (producción) lo hace el pipeline al publicar, en tres
tiempos: primero crea lo nuevo, después corre estas migraciones, y recién ahí
borra lo viejo. Si una migración falla, **lo viejo no se borra**: el dato sigue
ahí.
Si la base destino no tiene ninguna fila (el primer publish de un sistema, o un
clon recién creado), las migraciones se registran como aplicadas **sin
ejecutarse**: no hay nada que convertir, la estructura final la crea el push del
schema, y correr transformaciones escritas contra estructuras intermedias solo
puede fallar.
Cada base lleva su propio registro de qué corrió, en la tabla
`beon.data_migrations`. Está fuera del schema de la app a propósito (`public` en
Neon; `app` / `iteration` en Supabase), para que `prisma db push` no se la lleve
puesta.
## El orden de un cambio destructivo
1. Agregar lo nuevo (columna nullable, tabla, tipo).
2. La migración de datos acá, que llena lo nuevo desde lo viejo.
3. Borrar lo viejo.
Nunca al revés.
