export const SCANNER_STATUSES = ["ok", "not_found", "sin_stock", "retirado", "error"] as const;

export type ScannerStatus = (typeof SCANNER_STATUSES)[number];

export type ScanEvent = {
  code: string;
  seq: number;
  ts: number;
};

export type ScannerResult = {
  seq: number;
  status: ScannerStatus;
  name?: string;
};

export function createScannerUuid(): string {
  const secureCrypto = globalThis.crypto;
  if (!secureCrypto?.getRandomValues) {
    throw new Error(
      "Este navegador no permite generar una sesión segura. Abre la aplicación desde localhost o mediante HTTPS.",
    );
  }

  const bytes = secureCrypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function isScannerStatus(value: unknown): value is ScannerStatus {
  return typeof value === "string" && SCANNER_STATUSES.includes(value as ScannerStatus);
}

export function parseScanEvent(value: unknown): ScanEvent | null {
  if (!value || typeof value !== "object") return null;
  const { code, seq, ts } = value as Record<string, unknown>;
  if (
    typeof code !== "string" ||
    !code.trim() ||
    typeof seq !== "number" ||
    !Number.isSafeInteger(seq) ||
    seq < 1 ||
    typeof ts !== "number" ||
    !Number.isFinite(ts)
  ) {
    return null;
  }
  return { code: code.trim(), seq, ts };
}
