import type { Prisma } from "@prisma/client";

export async function lockCashOperations(tx: Prisma.TransactionClient) {
  await tx.$queryRaw`WITH cash_lock AS MATERIALIZED (SELECT pg_advisory_xact_lock(78421309)) SELECT 1 FROM cash_lock`;
}

export function cashMethodFromSale(method: string) {
  if (method === "Efectivo") return "CASH";
  if (method === "Tarjeta") return "CARD";
  if (method === "Transferencia") return "TRANSFER";
  if (method === "Crédito") return "CREDIT";
  return "OTHER";
}

export function cents(value: number) {
  return Math.round(value * 100);
}
