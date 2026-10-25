"use server";

import {
  addCountLine,
  addProductBarcode,
  addProductUnit,
  approveStockCount,
  cancelStockCount,
  cancelTransfer,
  createStockCount,
  createTransfer,
  decideAdjustment,
  postStockMovement,
  receiveTransfer,
  recordCountQuantities,
  requestAdjustment,
  resolveLotId,
  reverseOperation,
  sendTransfer,
  setLotStatus,
  submitStockCount,
  updateProductInventorySettings,
  type OperationalType,
} from "@rc/domain";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { runAction, str, type FormState } from "@/server/actions";
import { resolveProductCode } from "@/server/inventory";
import { requireTenant } from "@/server/session";

const refresh = () => revalidatePath("/app", "layout");

export async function postMovementAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const { actor } = await requireTenant("inventory.move");
    const { product } = await resolveProductCode(actor, str(fd, "productCode"));
    const type = str(fd, "type") as OperationalType;
    const outbound = type === "ISSUE" || type === "RETURN_OUT";
    const lotNumber = str(fd, "lotNumber");
    const r = await postStockMovement(actor, {
      idempotencyKey: str(fd, "idempotencyKey"),
      type,
      warehouseId: str(fd, "warehouseId"),
      productId: product.id,
      quantity: str(fd, "quantity"),
      unit: str(fd, "unit"),
      ...(outbound ? { lotId: (await resolveLotId(actor, product.id, lotNumber)) ?? undefined } : { lotNumber, expiresAt: str(fd, "expiresAt") }),
      unitCost: str(fd, "unitCost") || undefined,
      reason: str(fd, "reason") || undefined,
    });
    refresh();
    const lots = r.movements.length > 1 ? ` (${r.movements.length} lotes por FEFO)` : "";
    return { ok: true, message: r.replayed ? "Esta operación ya estaba registrada; no se duplicó." : `Movimiento registrado: ${product.sku}${lots}.` };
  });
}

export async function reverseOperationAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const { actor } = await requireTenant("inventory.adjust");
    await reverseOperation(actor, str(fd, "operationId"), str(fd, "reason"));
    refresh();
    return { ok: true, message: "Operación revertida." };
  });
}

export async function updateProductSettingsAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const { actor } = await requireTenant("products.write");
    await updateProductInventorySettings(actor, str(fd, "productId"), {
      baseUnit: str(fd, "baseUnit"),
      lotTracking: fd.get("lotTracking") === "on",
      requiresExpiry: fd.get("requiresExpiry") === "on",
      minStock: str(fd, "minStock") || null,
    });
    refresh();
    return { ok: true, message: "Configuración guardada." };
  });
}

export async function addUnitAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const { actor } = await requireTenant("products.write");
    await addProductUnit(actor, str(fd, "productId"), { code: str(fd, "code"), name: str(fd, "name"), factorToBase: str(fd, "factor") });
    refresh();
    return { ok: true, message: "Presentación agregada." };
  });
}

export async function addBarcodeAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const { actor } = await requireTenant("products.write");
    await addProductBarcode(actor, str(fd, "productId"), { code: str(fd, "code"), unitCode: str(fd, "unitCode") || undefined });
    refresh();
    return { ok: true, message: "Código agregado." };
  });
}

export async function setLotStatusAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const { actor } = await requireTenant("inventory.adjust");
    await setLotStatus(actor, str(fd, "lotId"), str(fd, "status") as "AVAILABLE", str(fd, "reason"));
    refresh();
    return { ok: true, message: "Estado del lote actualizado." };
  });
}

export async function requestAdjustmentAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const { actor } = await requireTenant("inventory.adjust");
    const { product } = await resolveProductCode(actor, str(fd, "productCode"));
    const kind = str(fd, "kind") === "WASTE" ? "WASTE" : "ADJUSTMENT";
    const r = await requestAdjustment(actor, {
      warehouseId: str(fd, "warehouseId"),
      productId: product.id,
      lotId: (await resolveLotId(actor, product.id, str(fd, "lotNumber"))) ?? undefined,
      direction: kind === "WASTE" ? "OUT" : str(fd, "direction") === "IN" ? "IN" : "OUT",
      kind,
      quantity: str(fd, "quantity"),
      unit: str(fd, "unit"),
      reason: str(fd, "reason"),
    });
    refresh();
    return {
      ok: true,
      message: r.status === "APPLIED" ? "Ajuste aplicado." : "Ajuste enviado: supera el umbral y requiere la aprobación de otro usuario.",
    };
  });
}

export async function decideAdjustmentAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const { actor } = await requireTenant("inventory.adjust.approve");
    const decision = str(fd, "decision") === "APPROVE" ? "APPROVE" : "REJECT";
    await decideAdjustment(actor, str(fd, "adjustmentId"), decision, str(fd, "note") || undefined);
    refresh();
    return { ok: true, message: decision === "APPROVE" ? "Ajuste aprobado y aplicado." : "Ajuste rechazado." };
  });
}

export async function createCountAction(_: FormState, fd: FormData): Promise<FormState> {
  const res = await runAction(async () => {
    const { actor } = await requireTenant("inventory.count");
    const c = await createStockCount(actor, { warehouseId: str(fd, "warehouseId"), note: str(fd, "note") });
    return { ok: true, data: c.id };
  });
  if (res.ok) redirect(`/app/conteos/${res.data}`);
  return res;
}

export async function saveCountAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const { actor } = await requireTenant("inventory.count");
    const countId = str(fd, "countId");
    const entries = [...fd.entries()]
      .filter(([k]) => k.startsWith("counted:"))
      .map(([k, v]) => ({ lineId: k.slice(8), counted: typeof v === "string" && v.trim() !== "" ? v : null }));
    await recordCountQuantities(actor, countId, entries);
    if (str(fd, "intent") === "submit") {
      const r = await submitStockCount(actor, countId);
      refresh();
      return {
        ok: true,
        message: r.status === "APPLIED" ? "Conteo aplicado: existencias ajustadas." : "Conteo enviado: la diferencia supera el umbral y requiere aprobación de otro usuario.",
      };
    }
    refresh();
    return { ok: true, message: "Cantidades guardadas." };
  });
}

export async function addCountLineAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const { actor } = await requireTenant("inventory.count");
    const { product } = await resolveProductCode(actor, str(fd, "productCode"));
    await addCountLine(actor, str(fd, "countId"), {
      productId: product.id,
      lotId: (await resolveLotId(actor, product.id, str(fd, "lotNumber"))) ?? undefined,
    });
    refresh();
    return { ok: true, message: "Producto agregado al conteo." };
  });
}

export async function decideCountAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const intent = str(fd, "intent");
    if (intent === "approve") {
      const { actor } = await requireTenant("inventory.adjust.approve");
      await approveStockCount(actor, str(fd, "countId"));
    } else {
      const { actor } = await requireTenant("inventory.count");
      await cancelStockCount(actor, str(fd, "countId"));
    }
    refresh();
    return { ok: true, message: intent === "approve" ? "Conteo aprobado y aplicado." : "Conteo cancelado." };
  });
}

export async function createTransferAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const { actor } = await requireTenant("inventory.transfer");
    const lines = [];
    for (let i = 0; i < 5; i++) {
      const code = str(fd, `line${i}.productCode`);
      if (!code.trim()) continue;
      const { product } = await resolveProductCode(actor, code);
      lines.push({
        productId: product.id,
        quantity: str(fd, `line${i}.quantity`),
        unit: str(fd, `line${i}.unit`) || product.baseUnit,
        lotId: (await resolveLotId(actor, product.id, str(fd, `line${i}.lotNumber`))) ?? undefined,
      });
    }
    await createTransfer(actor, { fromWarehouseId: str(fd, "fromWarehouseId"), toWarehouseId: str(fd, "toWarehouseId"), note: str(fd, "note"), lines });
    refresh();
    return { ok: true, message: "Transferencia creada en borrador." };
  });
}

export async function transferStepAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const { actor } = await requireTenant("inventory.transfer");
    const id = str(fd, "transferId");
    const intent = str(fd, "intent");
    if (intent === "send") await sendTransfer(actor, id);
    else if (intent === "receive") await receiveTransfer(actor, id);
    else await cancelTransfer(actor, id, str(fd, "reason") || "Cancelada por el usuario");
    refresh();
    return { ok: true, message: intent === "send" ? "Transferencia enviada." : intent === "receive" ? "Transferencia recibida." : "Transferencia cancelada." };
  });
}
