export function isRemoteScannerEnabled(): boolean {
  return process.env.REMOTE_SCANNER_ENABLED === "true";
}
