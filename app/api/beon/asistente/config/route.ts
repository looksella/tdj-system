// Returns assistant configuration to authenticated application clients.
import { NextResponse } from "next/server";
import { configuracion } from "@/lib/beon-asistente";
import { getEffectiveUser } from "@/lib/supabase/helpers";
import { isAllowed } from "@/lib/auth-helpers";
export const dynamic = "force-dynamic";
export async function GET() {
  const config = await configuracion();
  const user = await getEffectiveUser();
  // Employees cannot see the assistant even when it is enabled for the business.
  const visible = config.enabled && !!user && isAllowed(user.role, "assistant:access");
  return NextResponse.json({
    enabled: visible,
    suggestedQuestions: visible ? config.suggestedQuestions : [],
    creditsPerQuestionHint: config.creditsPerQuestionHint,
    ownerHasCredits: config.ownerHasCredits,
  });
}
