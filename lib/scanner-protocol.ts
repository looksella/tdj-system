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
