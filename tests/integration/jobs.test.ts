import { forEachActiveTenant, createProduct, purgeExpiredEphemeralData } from "@rc/domain";
import { prisma } from "@rc/db";
import { describe, expect, it } from "vitest";
import { actorFor, createCompany, createSession, createUser } from "./helpers";

describe("Jobs aislados por empresa (aceptación 11, parte jobs)", () => {
  it("cada unidad de trabajo solo ve los datos de su empresa", async () => {
    const o1 = await createUser("job-a");
    const o2 = await createUser("job-b");
    const t1 = (await createCompany(o1, "PROFESIONAL", "Job A")).tenant.id;
    const t2 = (await createCompany(o2, "PROFESIONAL", "Job B")).tenant.id;
    await createProduct(await actorFor(o1, t1), { sku: "JOB-1", name: "Solo de A" });
    await createProduct(await actorFor(o2, t2), { sku: "JOB-2", name: "Solo de B" });

    const seen = await forEachActiveTenant(async (tx, tenantId) => {
      const products = await tx.product.findMany({ select: { tenantId: true, sku: true } });
      return { tenantId, foreign: products.filter((p) => p.tenantId !== tenantId).length, skus: products.map((p) => p.sku) };
    });
    for (const [tenantId, r] of seen) {
      expect(r.tenantId).toBe(tenantId);
      expect(r.foreign).toBe(0);
    }
    expect(seen.get(t1)?.skus).toEqual(["JOB-1"]);
    expect(seen.get(t2)?.skus).toEqual(["JOB-2"]);
  });

  it("la purga de datos efímeros es idempotente", async () => {
    const u = await createUser("job-purga");
    const s = await createSession(u.userId);
    await prisma.session.update({ where: { id: s.id }, data: { expires: new Date(Date.now() - 1000) } });
    const first = await purgeExpiredEphemeralData();
    expect(first.sessions).toBeGreaterThanOrEqual(1);
    const second = await purgeExpiredEphemeralData();
    expect(second.sessions).toBe(0);
  });
});
