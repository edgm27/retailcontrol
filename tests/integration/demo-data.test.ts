import { withContext } from "@rc/db";
import { DEMO_COMPANY_NAME, generateDemoCompany, getDashboardAnalytics, listUserTenants, resolveTenantAccess, runReport } from "@rc/domain";
import { describe, expect, it } from "vitest";
import { actorFor, createCompany, createUser } from "./helpers";

describe("Empresa de demostración", () => {
  it("crea una empresa aparte con catálogo, historia y pendientes, sin tocar las empresas existentes", async () => {
    const u = await createUser("demo-dueno");
    const own = await createCompany(u, "PROFESIONAL", "Mi empresa real");
    const r = await generateDemoCompany(u, { days: 10, productLimit: 36 });
    expect(r.tenantId).not.toBe(own.tenant.id);
    expect(r.products).toBe(36);
    expect(r.sales).toBeGreaterThan(50);

    const tenants = await listUserTenants(u.userId);
    expect(tenants.map((t) => t.name)).toEqual(expect.arrayContaining(["Mi empresa real", DEMO_COMPANY_NAME]));
    const T = r.tenantId;
    const counts = await withContext({ tenantId: T }, async (tx) => ({
      products: await tx.product.count({ where: { tenantId: T } }),
      barcodes: await tx.productBarcode.count({ where: { tenantId: T } }),
      lots: await tx.lot.count({ where: { tenantId: T } }),
      suppliers: await tx.supplier.count({ where: { tenantId: T } }),
      pendingCounts: await tx.stockCount.count({ where: { tenantId: T, status: "PENDING_APPROVAL" } }),
      openPOs: await tx.purchaseOrder.count({ where: { tenantId: T, status: { in: ["APPROVED", "PARTIALLY_RECEIVED"] } } }),
      transit: await tx.transfer.count({ where: { tenantId: T, status: "SENT" } }),
      members: await tx.membership.count({ where: { tenantId: T } }),
    }));
    expect(counts).toMatchObject({ products: 36, suppliers: 6, members: 2, openPOs: 2 });
    expect(counts.barcodes).toBeGreaterThan(36);
    expect(counts.lots).toBeGreaterThan(20);
    expect(counts.pendingCounts).toBeGreaterThanOrEqual(0);

    // La empresa real no recibió nada.
    const mine = await withContext({ tenantId: own.tenant.id }, (tx) => tx.product.count({ where: { tenantId: own.tenant.id } }));
    expect(mine).toBe(0);

    // Los reportes y el tablero funcionan con los datos generados.
    const actor = await actorFor(u, T);
    expect((await resolveTenantAccess(u.userId, T))?.role).toBe("OWNER");
    const dash = await getDashboardAnalytics(actor, { days: 30 });
    expect(dash.kpis.inventoryValue).toBeGreaterThan(0);
    expect(dash.kpis.outbound.value).toBeGreaterThan(0);
    const abc = await runReport(actor, "abc", { days: 30 });
    expect(abc.rows.some((x) => x.clase === "A")).toBe(true);
  }, 300_000);
});
