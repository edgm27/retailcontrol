import { type Tx } from "@rc/db";

/** Número correlativo por empresa y tipo de documento (serializado con candado transaccional). */
export async function nextDocumentNumber(tx: Tx, tenantId: string, kind: "purchase_orders" | "goods_receipts"): Promise<number> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`docnum:${kind}:${tenantId}`}, 0))`;
  const rows =
    kind === "purchase_orders"
      ? await tx.$queryRaw<{ n: number | null }[]>`SELECT MAX(number) AS n FROM purchase_orders WHERE tenant_id = ${tenantId}::uuid`
      : await tx.$queryRaw<{ n: number | null }[]>`SELECT MAX(number) AS n FROM goods_receipts WHERE tenant_id = ${tenantId}::uuid`;
  return (rows[0]?.n ?? 0) + 1;
}
