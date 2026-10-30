import { PrismaClient } from "@prisma/client";

// El host directo de Supabase (db.<ref>.supabase.co) solo publica registros IPv6.
// En Vercel, que sale por IPv4, esa cadena nunca conecta: ahí hay que usar el
// pooler (puerto 6543). Avisamos una vez para que el log diga la causa real.
function hostDe(url: string | undefined) {
  try {
    return url ? new URL(url).hostname : "";
  } catch {
    return "";
  }
}

if (
  process.env.NODE_ENV === "production" &&
  /^db\.[a-z0-9]+\.supabase\.co$/i.test(hostDe(process.env.DATABASE_URL))
) {
  console.warn(
    "[db] DATABASE_URL usa el host directo de Supabase (solo IPv6). Usá la cadena Transaction pooler (puerto 6543).",
  );
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};
export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
