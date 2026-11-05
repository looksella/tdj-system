export function getScannerCameraEnvironmentError(
  isSecureContext: boolean,
  hasCameraApi: boolean,
): string | null {
  if (!isSecureContext) {
    return "El navegador bloquea la cámara en direcciones HTTP locales. Abre https://tdj-system.vercel.app en la computadora y en el celular, inicia sesión en ambos y vuelve a vincular el escáner.";
  }
  if (!hasCameraApi) {
    return "Este navegador no ofrece acceso a la cámara. Actualízalo e intenta abrir de nuevo el escáner.";
  }
  return null;
}

export function getScannerCameraRequestError(error: unknown): string {
  const name =
    typeof error === "object" && error !== null && "name" in error && typeof error.name === "string"
      ? error.name
      : "";

  if (name === "NotAllowedError" || name === "SecurityError") {
    return "El permiso de cámara está bloqueado. Permite la cámara para este sitio en el navegador y vuelve a intentar.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No se encontró una cámara disponible en este dispositivo.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "No se pudo iniciar la cámara. Cierra otras aplicaciones que la estén usando y vuelve a intentar.";
  }
  if (name === "OverconstrainedError" || name === "ConstraintNot satisfied") {
    return "La cámara seleccionada ya no está disponible. Elige otra cámara e intenta de nuevo.";
  }
  return "No se pudo iniciar la cámara. Revisa sus permisos y vuelve a intentar.";
}
