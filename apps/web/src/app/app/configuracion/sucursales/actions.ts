"use server";

import { createBranch, createWarehouse } from "@rc/domain";
import { revalidatePath } from "next/cache";
import { runAction, str, type FormState } from "@/server/actions";
import { requireTenant } from "@/server/session";

export async function createBranchAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const { actor } = await requireTenant("branches.manage");
    await createBranch(actor, { code: str(fd, "code"), name: str(fd, "name"), address: str(fd, "address") });
    revalidatePath("/app/configuracion/sucursales");
    return { ok: true, message: "Sucursal creada." };
  });
}

export async function createWarehouseAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const { actor } = await requireTenant("branches.manage");
    await createWarehouse(actor, { branchId: str(fd, "branchId"), code: str(fd, "code"), name: str(fd, "name") });
    revalidatePath("/app/configuracion/sucursales");
    return { ok: true, message: "Almacén creado." };
  });
}
