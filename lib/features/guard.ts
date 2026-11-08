import { isFeatureEnabled } from "@/lib/features/resolve";

/**
 * Para Server Actions y route handlers: `null` = seguí, texto = herramienta
 * apagada. El estado se lee de la base en cada solicitud, con cache por
 * request, así que apagarla surte efecto en el siguiente llamado.
 */
export async function denialForFeature(featureKey: string): Promise<string | null> {
  if (await isFeatureEnabled(featureKey)) return null;
  return "Esta herramienta está apagada. Pedile al administrador que la active en Configuración.";
}
