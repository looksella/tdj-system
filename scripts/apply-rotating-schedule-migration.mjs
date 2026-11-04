import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const migrationFile = resolve(
  root,
  "prisma/migrations/20261104155100_rotating_employee_schedules/migration.sql",
);
const prismaCli = resolve(root, "node_modules/prisma/build/index.js");
const connection = process.env.DIRECT_DATABASE_URL;

if (!connection) {
  console.error(
    "Falta DIRECT_DATABASE_URL. Configúrala en .env con la URI Session pooler de Supabase.",
  );
  process.exit(1);
}

try {
  const parsed = new URL(connection);
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new Error();
  }
  if (/^db\..+\.supabase\.co$/i.test(parsed.hostname)) {
    console.error(
      "DIRECT_DATABASE_URL usa el host directo de Supabase. En Supabase → Connect, copia la URI Session pooler (puerto 5432) y actualiza .env.",
    );
    process.exit(1);
  }
  if (parsed.hostname.endsWith(".pooler.supabase.com") && (parsed.port || "5432") !== "5432") {
    console.error(
      "DIRECT_DATABASE_URL debe usar Session pooler en el puerto 5432, no Transaction pooler.",
    );
    process.exit(1);
  }
} catch {
  console.error("DIRECT_DATABASE_URL no es una URI PostgreSQL válida. No se mostró su contenido.");
  process.exit(1);
}

if (!existsSync(prismaCli) || !existsSync(migrationFile)) {
  console.error(
    "Faltan Prisma CLI o el archivo de migración. Ejecuta npm install y vuelve a intentar.",
  );
  process.exit(1);
}

process.env.DATABASE_URL = connection;
const result = spawnSync(
  process.execPath,
  [
    prismaCli,
    "db",
    "execute",
    "--schema",
    "prisma/schema.prisma",
    "--file",
    "prisma/migrations/20261104155100_rotating_employee_schedules/migration.sql",
  ],
  { cwd: root, env: process.env, stdio: "inherit" },
);

if (result.error) {
  console.error("No se pudo iniciar Prisma para aplicar la migración.");
  process.exit(1);
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log("Migración de jornadas rotativas aplicada correctamente.");
