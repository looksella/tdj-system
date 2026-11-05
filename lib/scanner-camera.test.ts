import { describe, expect, it } from "vitest";
import { getScannerCameraEnvironmentError, getScannerCameraRequestError } from "./scanner-camera";

describe("getScannerCameraEnvironmentError", () => {
  it("explains that a local HTTP address must be opened over HTTPS", () => {
    expect(getScannerCameraEnvironmentError(false, false)).toContain("direcciones HTTP locales");
    expect(getScannerCameraEnvironmentError(false, false)).toContain(
      "https://tdj-system.vercel.app",
    );
  });

  it("reports browsers that do not provide the camera API", () => {
    expect(getScannerCameraEnvironmentError(true, false)).toContain("no ofrece acceso a la cámara");
  });

  it("allows camera requests in a secure context with camera support", () => {
    expect(getScannerCameraEnvironmentError(true, true)).toBeNull();
  });
});

describe("getScannerCameraRequestError", () => {
  it("gives a specific permission error", () => {
    expect(getScannerCameraRequestError({ name: "NotAllowedError" })).toContain(
      "permiso de cámara está bloqueado",
    );
  });

  it("gives a specific error when the camera is busy", () => {
    expect(getScannerCameraRequestError({ name: "NotReadableError" })).toContain(
      "Cierra otras aplicaciones",
    );
  });
});
