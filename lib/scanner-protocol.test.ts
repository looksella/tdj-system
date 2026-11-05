import { describe, expect, it } from "vitest";
import { createScannerUuid, isScannerStatus, parseScanEvent } from "./scanner-protocol";

describe("createScannerUuid", () => {
  it("genera identificadores UUID v4", () => {
    const uuid = createScannerUuid();

    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });
});

describe("parseScanEvent", () => {
  it("acepta un evento de escaneo bien formado y recorta el código", () => {
    expect(
      parseScanEvent({
        code: "  EAN13A8  ",
        seq: 3,
        ts: 1_762_342_000_000,
      }),
    ).toEqual({
      code: "EAN13A8",
      seq: 3,
      ts: 1_762_342_000_000,
    });
  });

  it("rechaza payloads malformados", () => {
    expect(parseScanEvent({ code: "", seq: 1, ts: 1 })).toBeNull();
    expect(parseScanEvent({ code: "ABC123", seq: 0, ts: 1 })).toBeNull();
    expect(parseScanEvent({ code: "ABC123", seq: 1.5, ts: 1 })).toBeNull();
    expect(parseScanEvent({ code: "ABC123", seq: 1, ts: "ahora" })).toBeNull();
  });
});

describe("isScannerStatus", () => {
  it("acepta solamente estados que la PC puede informar al móvil", () => {
    expect(isScannerStatus("ok")).toBe(true);
    expect(isScannerStatus("sin_stock")).toBe(true);
    expect(isScannerStatus("no_existe")).toBe(false);
  });
});
