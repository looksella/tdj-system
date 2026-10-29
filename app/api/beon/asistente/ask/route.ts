// Authenticated API endpoint for assistant queries.
import { NextResponse } from "next/server";
import { entornoActual, preguntar } from "@/lib/beon-asistente";
import { getEffectiveUser } from "@/lib/supabase/helpers";
import { isAllowed } from "@/lib/auth-helpers";
export const dynamic = "force-dynamic";
// El asistente hace hasta dos llamadas a un modelo más un SELECT: el default de
// Vercel se queda corto y el corte se ve como "no me contestó nunca".
export const maxDuration = 60;
export async function POST(request: Request) {
  const user = await getEffectiveUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAllowed(user.role, "assistant:access")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  let body: { question?: unknown; locale?: unknown };
  try {
    body = (await request.json()) as { question?: unknown; locale?: unknown };
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const locale = body.locale === "pt" ? "pt" : "es";
  const respuesta = await preguntar({ question, env: entornoActual(), locale });
  return NextResponse.json(respuesta);
}