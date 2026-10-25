import { withContext } from "@rc/db";
import {
  changeMemberRole,
  createBranch,
  createProduct,
  inviteMember,
  listAuditEvents,
  listBranches,
  listMembers,
  setMemberStatus,
  type TenantActor,
} from "@rc/domain";
import { beforeAll, describe, expect, it } from "vitest";
import { actorFor, addMember, createCompany, createUser } from "./helpers";

describe("Autorización por rol (aceptación 3)", () => {
  let tenantId: string;
  let owner: TenantActor;
  let admin: TenantActor;
  let warehouse: TenantActor;
  let readonly: TenantActor;
  let auditor: TenantActor;

  beforeAll(async () => {
    const o = await createUser("dueno");
    tenantId = (await createCompany(o, "EMPRESARIAL", "Empresa roles")).tenant.id;
    owner = await actorFor(o, tenantId);
    const mk = async (role: TenantActor["role"]) => {
      const u = await createUser(role.toLowerCase());
      await addMember(tenantId, u, role);
      return actorFor(u, tenantId);
    };
    admin = await mk("ADMIN");
    warehouse = await mk("WAREHOUSE");
    readonly = await mk("READONLY");
    auditor = await mk("AUDITOR");
  });

  it("un almacenista no gestiona usuarios ni sucursales", async () => {
    await expect(inviteMember(warehouse, { email: "x@example.com", role: "READONLY" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createBranch(warehouse, { code: "S2", name: "Sucursal 2" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listMembers(warehouse)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("solo lectura no crea productos, pero sí los consulta", async () => {
    await expect(createProduct(readonly, { sku: "RO-1", name: "No debe crearse" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listBranches(readonly)).resolves.toBeTruthy();
  });

  it("solo propietario, administrador y auditor leen la auditoría", async () => {
    await expect(listAuditEvents(auditor)).resolves.toBeTruthy();
    await expect(listAuditEvents(admin)).resolves.toBeTruthy();
    await expect(listAuditEvents(warehouse)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("un administrador no puede crear propietarios ni degradar a un propietario", async () => {
    await expect(inviteMember(admin, { email: "nuevo.dueno@example.com", role: "OWNER" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(changeMemberRole(admin, owner.membershipId, "READONLY")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(setMemberStatus(admin, owner.membershipId, "DISABLED")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("un administrador no puede auto-ascenderse a propietario", async () => {
    await expect(changeMemberRole(admin, admin.membershipId, "OWNER")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("la empresa no puede quedarse sin propietario activo", async () => {
    await expect(changeMemberRole(owner, owner.membershipId, "ADMIN")).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(setMemberStatus(owner, owner.membershipId, "DISABLED")).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("los cambios de rol quedan auditados con antes/después", async () => {
    await changeMemberRole(owner, readonly.membershipId, "BUYER");
    const ev = await withContext({ tenantId }, (tx) =>
      tx.auditEvent.findFirst({ where: { action: "member.role_changed", entityId: readonly.membershipId } }),
    );
    expect(ev?.before).toEqual({ role: "READONLY" });
    expect(ev?.after).toEqual({ role: "BUYER" });
    expect(ev?.actorUserId).toBe(owner.userId);
  });
});

describe("Alcance por sucursal", () => {
  it("un miembro limitado a una sucursal no ve ni crea en otras", async () => {
    const o = await createUser("dueno-suc");
    const created = await createCompany(o, "PROFESIONAL", "Empresa sucursales");
    const tenantId = created.tenant.id;
    const owner = await actorFor(o, tenantId);
    const b2 = await createBranch(owner, { code: "S2", name: "Sucursal 2" });
    const u = await createUser("limitado");
    const m = await addMember(tenantId, u, "ADMIN");
    await withContext({ tenantId }, (tx) =>
      tx.membershipBranch.create({ data: { tenantId, membershipId: m.id, branchId: b2.id } }),
    );
    const limited = await actorFor(u, tenantId);
    expect(limited.branchIds).toEqual([b2.id]);
    const visible = await listBranches(limited);
    expect(visible.map((b) => b.id)).toEqual([b2.id]);
    await expect(createBranch(limited, { code: "S3", name: "Otra" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
