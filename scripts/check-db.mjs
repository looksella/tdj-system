import { PrismaClient } from "@prisma/client";
import { lookup } from "node:dns/promises";

function parse(raw) {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return {
      host: url.hostname,
      port: url.port || "5432",
      database: url.pathname.replace(/^\//, ""),
      user: decodeURIComponent(url.username),
      pooled: (url.searchParams.get("pgbouncer") ?? "") === "true",
    };
  } catch {
    return null;
  }
}

async function resolve(host) {
  const [v4, v6] = await Promise.all([
    lookup(host, { family: 4 }).then((r) => r.address, () => null),
    lookup(host, { family: 6 }).then((r) => r.address, () => null),
  ]);
  return { v4, v6 };
}

function line(label, value) {
  console.log(`  ${label.padEnd(10)} ${value}`);
}

async function describe(label, raw) {
  const info = parse(raw);
  if (!info) {
    console.log(`${label}: sin configurar o con formato inválido.\n`);
    return null;
  }
  console.log(`${label}`);
  line("host", info.host);
  line("puerto", info.port);
  line("base", info.database);
  line("usuario", info.user);
  line("pgbouncer", info.pooled ? "sí" : "no");

  const { v4, v6 } = await resolve(info.host);
  line("IPv4", v4 ?? "sin registro A");
  line("IPv6", v6 ?? "sin registro AAAA");

  const directo = /^db\.[a-z0-9]+\.supabase\.co$/i.test(info.host);
  if (directo && !v4) {
    console.log(
      "  ⚠ Host directo de Supabase solo con IPv6: Vercel y otras redes IPv4 no lo alcanzan.",
    );
  }
  console.log("");
  return { ...info, v4, v6, directo };
}

async function main() {
  const url = process.env.DATABASE_URL;
  const direct = process.env.DIRECT_DATABASE_URL;

  const runtime = await describe("DATABASE_URL (la usa la aplicación en ejecución)", url);
  await describe("DIRECT_DATABASE_URL (solo la usa el CLI de Prisma)", direct);

  if (!runtime) {
    console.log("Configura DATABASE_URL en .env antes de probar la conexión.");
    process.exitCode = 1;
    return;
  }

  const db = new PrismaClient({ log: [] });
  try {
    await db.$queryRaw`select 1`;
    console.log("Conexión: OK");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log("Conexión: FALLÓ");
    console.log(message.split("\n").filter(Boolean).slice(0, 6).join("\n"));
    if (runtime.directo && !runtime.v4) {
      console.log(
        "\nEsta cadena funciona en tu equipo (que tiene IPv6) pero no en Vercel.\nUsa la cadena Transaction pooler (puerto 6543) de Supabase → Connect.",
      );
    }
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
