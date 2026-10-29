import { AsistenteChat } from "@/components/beon/asistente-chat";
import {
  configuracion,
  entornoActual,
  generarSugerencias,
} from "@/lib/beon-asistente";
import { idiomaDelNegocio } from "@/lib/beon-idioma";
import { requirePagePermission } from "@/lib/require-page-permission";
export const dynamic = "force-dynamic";
export default async function AsistentePage() {
  await requirePagePermission("assistant:access");
  const config = await configuracion();
  // Generate suggested questions on the first assistant visit when none exist.
  const sugeridas = config.enabled && config.suggestedQuestions.length === 0
    ? await generarSugerencias(entornoActual(), idiomaDelNegocio())
    : config.suggestedQuestions;
  return (
    <AsistenteChat
      enabled={config.enabled}
      suggestedQuestions={sugeridas}
      creditsPerQuestionHint={config.creditsPerQuestionHint}
      ownerHasCredits={config.ownerHasCredits}
      sandbox={entornoActual() === "sandbox"}
    />
  );
}