import { randomUUID } from "node:crypto";
import { Prisma, prisma, withContext } from "@rc/db";
import {
  createProduct,
  getProductBySku,
  listAuditEvents,
  listBranches,
  listProducts,
  listUserTenants,
  renameProduct,
  resolveTenantAccess,
  type TenantActor,
} from "@rc/domain";
import { beforeAll, describe, expect, it } from "vitest";
import { actorFor, addMember, createCompany, createUser } from "./helpers";

describe("Aislamiento multiempresa (RLS + autorización de servidor)", () => {
  let a: TenantActor;
  let b: TenantActor;
  let tenantA: string;
  let tenantB: string;
  let productA: string;
  let productB: string;

  beforeAll(async () => {
    const ownerA = await createUser("dueno-a");
    const ownerB = await createUser("dueno-b");
    tenantA = (await createCompany(ownerA, "PROFESIONAL", "Abastos A")).tenant.id;
    tenantB = (await createCompany(ownerB, "PROFESIONAL", "Ferretería B")).tenant.id;
    a = await actorFor(ownerA, tenantA);
    b = await actorFor(ownerB, tenantB);
    productA = (await createProduct(a, { sku: "MISMO-SKU", name: "Producto de A" })).id;
    productB = (await createProduct(b, { sku: "MISMO-SKU", name: "Producto de B" })).id;
  });

  it("aceptación 1: dos empresas con el mismo SKU no ven los datos de la otra", async () => {
    const pa = await getProductBySku(a, "mismo-sku");
    const pb = await getProductBySku(b, "MISMO-SKU");
    expect(pa?.id).toBe(productA);
    expect(pb?.id).toBe(productB);
    const listA = await listProducts(a);
    expect(listA.items.map((p) => p.id)).toEqual([productA]);
  });

  it("aceptación 1: la búsqueda no devuelve productos de otra empresa", async () => {
    const res = await listProducts(a, { search: "Producto de B" });
    expect(res.total).toBe(0);
  });

  it("aceptación 1: una empresa no puede modificar el producto de otra", async () => {
    await expect(renameProduct(a, productB, "Hackeado")).rejects.toMatchObject({ code: "NOT_FOUND" });
    const still = await withContext({ tenantId: tenantB }, (tx) => tx.product.findUnique({ where: { id: productB } }));
    expect(still?.name).toBe("Producto de B");
  });

  it("aunque el código olvide filtrar por tenant, RLS oculta y bloquea filas ajenas", async () => {
    await withContext({ tenantId: tenantA }, async (tx) => {
      // Consulta SIN where tenantId: RLS filtra igualmente.
      const all = await tx.product.findMany();
      expect(all.every((p) => p.tenantId === tenantA)).toBe(true);
      expect(await tx.product.findUnique({ where: { id: productB } })).toBeNull();
      const upd = await tx.product.updateMany({ where: { id: productB }, data: { name: "x" } });
      expect(upd.count).toBe(0);
      const raw = await tx.$queryRaw<{ n: bigint }[]>`SELECT count(*)::bigint AS n FROM products WHERE id = ${productB}::uuid`;
      expect(Number(raw[0]!.n)).toBe(0);
    });
  });

  it("insertar con tenant_id de otra empresa es rechazado por la política WITH CHECK", async () => {
    await expect(
      withContext({ tenantId: tenantA }, (tx) =>
        tx.product.create({ data: { tenantId: tenantB, sku: "INTRUSO", name: "Intruso" } }),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("mover una fila a otra empresa (UPDATE tenant_id) es rechazado", async () => {
    await expect(
      withContext({ tenantId: tenantA }, (tx) =>
        tx.product.update({ where: { id: productA }, data: { tenantId: tenantB } }),
      ),
    ).rejects.toThrow();
  });

  it("sin contexto de empresa no se ve ni se escribe nada (falla cerrada)", async () => {
    expect(await prisma.product.count()).toBe(0);
    expect(await prisma.branch.count()).toBe(0);
    expect(await prisma.tenant.count()).toBe(0);
    await expect(
      prisma.product.create({ data: { tenantId: tenantA, sku: "SIN-CTX", name: "Sin contexto" } }),
    ).rejects.toThrow();
  });

  it("FK compuesta: no se puede crear un almacén de A colgando de una sucursal de B", async () => {
    const branchB = (await listBranches(b))[0]!.id;
    // Incluso con contexto de A y tenant_id de A, la sucursal de B no existe para (A, branchB).
    await expect(
      withContext({ tenantId: tenantA }, (tx) =>
        tx.warehouse.create({ data: { tenantId: tenantA, branchId: branchB, code: "X", name: "Cruzado" } }),
      ),
    ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
  });

  it("el contexto no se filtra entre transacciones que reutilizan conexiones del pool", async () => {
    // Pool de 3 conexiones y 30 transacciones alternadas en paralelo.
    const runs = Array.from({ length: 30 }, (_, i) => {
      const t = i % 2 === 0 ? tenantA : tenantB;
      return withContext({ tenantId: t }, async (tx) => {
        const rows = await tx.product.findMany({ select: { tenantId: true } });
        return rows.every((r) => r.tenantId === t) && rows.length > 0;
      });
    });
    expect((await Promise.all(runs)).every(Boolean)).toBe(true);
    // Después de todo, una consulta fuera de transacción no hereda contexto.
    expect(await prisma.product.count()).toBe(0);
    const leftovers = await prisma.$queryRaw<{ t: string | null }[]>`SELECT NULLIF(current_setting('app.tenant_id', true), '') AS t`;
    expect(leftovers[0]!.t).toBeNull();
  });

  it("la auditoría de una empresa no expone eventos de otra", async () => {
    const evA = await listAuditEvents(a);
    expect(evA.items.length).toBeGreaterThan(0);
    expect(evA.items.every((e) => e.tenantId === tenantA)).toBe(true);
  });

  it("la bitácora de auditoría es inmutable para el rol de aplicación", async () => {
    await expect(
      withContext({ tenantId: tenantA }, (tx) => tx.auditEvent.updateMany({ data: { action: "alterado" } })),
    ).rejects.toThrow();
    await expect(
      withContext({ tenantId: tenantA }, (tx) => tx.auditEvent.deleteMany({})),
    ).rejects.toThrow();
  });

  it("los productos no se pueden borrar (se inactivan para preservar historial)", async () => {
    await expect(
      withContext({ tenantId: tenantA }, (tx) => tx.product.delete({ where: { id: productA } })),
    ).rejects.toThrow();
  });

  it("un contexto con UUID inválido es rechazado antes de llegar a SQL", async () => {
    await expect(withContext({ tenantId: "' OR 1=1 --" }, async () => 1)).rejects.toThrow(/inválido/);
  });
});

describe("Usuario con membresía en dos empresas (aceptación 2)", () => {
  it("solo actúa en la empresa del contexto autorizado", async () => {
    const ownerA = await createUser("dueno-a2");
    const ownerB = await createUser("dueno-b2");
    const ownerC = await createUser("dueno-c2");
    const shared = await createUser("compartido");
    const tA = (await createCompany(ownerA, "PROFESIONAL", "Empresa A2")).tenant.id;
    const tB = (await createCompany(ownerB, "PROFESIONAL", "Empresa B2")).tenant.id;
    const tC = (await createCompany(ownerC, "PROFESIONAL", "Empresa C2")).tenant.id;
    await addMember(tA, shared, "MANAGER");
    await addMember(tB, shared, "READONLY");

    const tenants = await listUserTenants(shared.userId);
    expect(tenants.map((t) => t.tenantId).sort()).toEqual([tA, tB].sort());
    expect(tenants.find((t) => t.tenantId === tA)?.role).toBe("MANAGER");

    // En A es gerente: puede crear productos.
    const inA = await actorFor(shared, tA);
    await expect(createProduct(inA, { sku: "P-1", name: "Creado en A" })).resolves.toBeTruthy();
    // En B es solo lectura: no puede crear.
    const inB = await actorFor(shared, tB);
    await expect(createProduct(inB, { sku: "P-1", name: "Creado en B" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    // En C no tiene membresía: el servidor no le concede contexto.
    expect(await resolveTenantAccess(shared.userId, tC)).toBeNull();
    expect(await resolveTenantAccess(shared.userId, randomUUID())).toBeNull();
  });

  it("una membresía desactivada pierde el acceso inmediatamente", async () => {
    const owner = await createUser("dueno-d");
    const member = await createUser("miembro-d");
    const t = (await createCompany(owner, "PROFESIONAL", "Empresa D")).tenant.id;
    const m = await addMember(t, member, "WAREHOUSE");
    expect(await resolveTenantAccess(member.userId, t)).not.toBeNull();
    await withContext({ tenantId: t }, (tx) => tx.membership.update({ where: { id: m.id }, data: { status: "DISABLED" } }));
    expect(await resolveTenantAccess(member.userId, t)).toBeNull();
  });
});

describe("Cobertura de RLS (meta-prueba)", () => {
  it("toda tabla con columna tenant_id tiene RLS habilitado y forzado con políticas", async () => {
    const rows = await withContext({}, (tx) =>
      tx.$queryRaw<{ table_name: string; rls: boolean; forced: boolean; policies: number }[]>`
        SELECT c.relname AS table_name, c.relrowsecurity AS rls, c.relforcerowsecurity AS forced,
               (SELECT count(*)::int FROM pg_policies p WHERE p.tablename = c.relname AND p.schemaname = 'public') AS policies
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'
          AND EXISTS (SELECT 1 FROM information_schema.columns col
                      WHERE col.table_schema = 'public' AND col.table_name = c.relname AND col.column_name = 'tenant_id')`,
    );
    expect(rows.length).toBeGreaterThanOrEqual(9);
    const bad = rows.filter((r) => !r.rls || !r.forced || r.policies === 0).map((r) => r.table_name);
    expect(bad).toEqual([]);
  });

  it("el rol de la aplicación no es superusuario ni tiene BYPASSRLS ni es dueño de tablas", async () => {
    const [role] = await prisma.$queryRaw<{ rolsuper: boolean; rolbypassrls: boolean; owns: number }[]>`
      SELECT r.rolsuper, r.rolbypassrls,
             (SELECT count(*)::int FROM pg_tables t WHERE t.schemaname = 'public' AND t.tableowner = current_user) AS owns
      FROM pg_roles r WHERE r.rolname = current_user`;
    expect(role).toEqual({ rolsuper: false, rolbypassrls: false, owns: 0 });
  });

  it("el rol de la aplicación no puede leer la tabla de migraciones", async () => {
    await expect(prisma.$queryRaw`SELECT * FROM _prisma_migrations LIMIT 1`).rejects.toThrow(/permission denied/i);
  });
});
