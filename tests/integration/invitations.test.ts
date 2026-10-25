import { prisma, withContext } from "@rc/db";
import { acceptInvitation, inviteMember, listUserTenants, revokeInvitation } from "@rc/domain";
import { describe, expect, it } from "vitest";
import { actorFor, createCompany, createUser } from "./helpers";

describe("Invitaciones", () => {
  it("el token se guarda solo como hash y la invitación se acepta una vez", async () => {
    const o = await createUser("inv-dueno");
    const t = (await createCompany(o, "PROFESIONAL")).tenant.id;
    const owner = await actorFor(o, t);
    const invitee = await createUser("inv-invitado");
    const inv = await inviteMember(owner, { email: invitee.email.toUpperCase(), role: "BUYER" });

    const stored = await withContext({ tenantId: t }, (tx) => tx.invitation.findUnique({ where: { id: inv.invitationId } }));
    expect(stored?.tokenHash).not.toBe(inv.token);
    expect(stored?.email).toBe(invitee.email);

    await expect(acceptInvitation(invitee, inv.token)).resolves.toMatchObject({ tenantId: t, role: "BUYER" });
    expect((await listUserTenants(invitee.userId)).map((x) => x.tenantId)).toContain(t);
    await expect(acceptInvitation(invitee, inv.token)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("un token reenviado a otra cuenta no sirve (debe coincidir el correo)", async () => {
    const o = await createUser("inv-dueno2");
    const t = (await createCompany(o, "PROFESIONAL")).tenant.id;
    const owner = await actorFor(o, t);
    const inv = await inviteMember(owner, { email: "destinatario@example.com", role: "READONLY" });
    const intruder = await createUser("intruso");
    await expect(acceptInvitation(intruder, inv.token)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("invitaciones revocadas o expiradas no se pueden aceptar", async () => {
    const o = await createUser("inv-dueno3");
    const t = (await createCompany(o, "PROFESIONAL")).tenant.id;
    const owner = await actorFor(o, t);
    const u = await createUser("inv-revocada");
    const inv = await inviteMember(owner, { email: u.email, role: "READONLY" });
    await revokeInvitation(owner, inv.invitationId);
    await expect(acceptInvitation(u, inv.token)).rejects.toMatchObject({ code: "CONFLICT" });

    const u2 = await createUser("inv-expirada");
    const inv2 = await inviteMember(owner, { email: u2.email, role: "READONLY" });
    await expect(acceptInvitation(u2, inv2.token, new Date(Date.now() + 73 * 3_600_000))).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("un usuario no ve invitaciones dirigidas a otro correo", async () => {
    const o = await createUser("inv-dueno4");
    const t = (await createCompany(o, "PROFESIONAL")).tenant.id;
    await inviteMember(await actorFor(o, t), { email: "privado@example.com", role: "READONLY" });
    const other = await createUser("curioso");
    const visible = await withContext({ userId: other.userId, userEmail: other.email }, (tx) => tx.invitation.findMany());
    expect(visible).toHaveLength(0);
    expect(await prisma.invitation.count()).toBe(0);
  });
});
