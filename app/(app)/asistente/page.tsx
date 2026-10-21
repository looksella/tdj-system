// ============================================================
// PLATFORM FILE — app/(app)/asistente/page.tsx
// Generado e inyectado por TuSistema. NO editar ni reescribir.
// Es la pantalla del módulo "Asistente IA". Vive adentro del
// layout del sistema (hereda el menú, como cualquier módulo) y
// el route group `(app)` es a propósito: si la app agrupa sus
// pantallas ahí, esta hereda el mismo layout; si no, el grupo no
// cambia la URL y sigue siendo /asistente.
// ============================================================
import { redirect } from "next/navigation";
import { AsistenteChat } from "@/components/beon/asistente-chat";
import {
  configuracion,
  entornoActual,
  generarSugerencias,
} from "@/lib/beon-asistente";
import { idiomaDelNegocio } from "@/lib/beon-idioma";
import { getEffectiveUser } from "@/lib/supabase/helpers";
export const dynamic = "force-dynamic";
export default async function AsistentePage() {
  const user = await getEffectiveUser();
  if (!user) redirect("/sign-in");
  // El guard real vive en `app/api/beon/asistente/ask`, que responde 403. Este
  // redirect solo evita mostrar una pantalla que no va a funcionar.
  if (user.role !== "admin") redirect("/");
  const config = await configuracion();
  // Las preguntas de ejemplo se generan la PRIMERA vez que alguien abre el
  // asistente, no antes: la plataforma las cachea por versión del sistema (y
  // por idioma), así que esto corre una sola vez y después viene resuelto. Va
  // acá y no en la ruta de configuración porque esa la consulta cada carga de
  // CUALQUIER pantalla de la app (para esconder el ítem del menú).
  //
  // El idioma sale del NEGOCIO y no de un literal: con `"es"` horneado, un
  // sistema en portugués mostraba la pantalla en portugués y las tres
  // preguntas de ejemplo en castellano.
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