"use server";

import {
  approvePurchaseOrder,
  cancelPurchaseOrder,
  createPurchaseOrder,
  createSupplier,
  createTaxRate,
  markNotificationsRead,
  receiveGoods,
  recordExchangeRate,
  setTaxRateActive,
  updateProductCommercial,
  updateSupplier,
  updateTenantSettings,
} from "@rc/domain";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { runAction, str, type FormState } from "@/server/actions";
import { resolveProductCode } from "@/server/inventory";
import { requireTenant } from "@/server/session";

const refresh = () => revalidatePath("/app", "layout");

function supplierFields(fd: FormData) {
  return {
    name: str(fd, "name"),
    legalName: str(fd, "legalName"),
    rif: str(fd, "rif"),
    contactName: str(fd, "contactName"),
    email: str(fd, "email"),
    phone: str(fd, "phone"),
    address: str(fd, "address"),
    paymentTermsDays: str(fd, "paymentTermsDays"),
    notes: str(fd, "notes"),
  };
}

export async function createSupplierAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const { actor } = await requireTenant("suppliers.write");
    const s = await createSupplier(actor, supplierFields(fd));
    refresh();
    return { ok: true, message: `Proveedor ${s.name} creado.` };
  });
}

export async function updateSupplierAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const { actor } = await requireTenant("suppliers.write");
    await updateSupplier(actor, str(fd, "supplierId"), { ...supplierFields(fd), active: fd.get("active") === "on" });
    refresh();
    return { ok: true, message: "Proveedor actualizado." };
  });
}

export async function recordRateAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const { actor } = await requireTenant("exchange_rates.manage");
    await recordExchangeRate(actor, {
      rate: str(fd, "rate"),
      effectiveDate: str(fd, "effectiveDate"),
      source: str(fd, "source") === "INTERNAL" ? "INTERNAL" : "BCV_MANUAL",
      sourceReference: str(fd, "sourceReference") || undefined,
    });
    refresh();
    return { ok: true, message: "Tasa registrada. Los documentos anteriores conservan su tasa." };
  });
}

/** Lee hasta `max` líneas con prefijo `lines[i].campo`. */
function readLines(fd: FormData, max: number) {
  const out: Record<string, string>[] = [];
  for (let i = 0; i < max; i++) {
    const get = (f: string) => str(fd, `lines[${i}].${f}`);
    if (!get("productCode").trim() && !get("poLineId")) continue;
    out.push({
      productCode: get("productCode"),
      productId: get("productId"),
      poLineId: get("poLineId"),
      quantity: get("quantity"),
      unit: get("unit"),
      unitPrice: get("unitPrice"),
      taxRate: get("taxRate"),
      lotNumber: get("lotNumber"),
      expiresAt: get("expiresAt"),
    });
  }
  return out;
}

export async function createPurchaseOrderAction(_: FormState, fd: FormData): Promise<FormState> {
  const res = await runAction(async () => {
    const { actor } = await requireTenant("purchases.write");
    const lines = [];
    for (const l of readLines(fd, 12)) {
      const { product } = await resolveProductCode(actor, l.productCode!);
      lines.push({ productId: product.id, quantity: l.quantity!, unit: l.unit || product.baseUnit, unitPrice: l.unitPrice!, taxRate: l.taxRate || "0" });
    }
    const po = await createPurchaseOrder(actor, {
      supplierId: str(fd, "supplierId"),
      warehouseId: str(fd, "warehouseId"),
      currency: str(fd, "currency") === "VES" ? "VES" : "USD",
      expectedDate: str(fd, "expectedDate"),
      notes: str(fd, "notes"),
      lines,
    });
    refresh();
    return { ok: true, data: po.id };
  });
  if (res.ok) redirect(`/app/compras/${res.data}`);
  return res;
}

export async function purchaseOrderStepAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const id = str(fd, "purchaseOrderId");
    if (str(fd, "intent") === "approve") {
      const { actor } = await requireTenant("purchases.approve");
      await approvePurchaseOrder(actor, id);
      refresh();
      return { ok: true, message: "Orden aprobada." };
    }
    const { actor } = await requireTenant("purchases.write");
    await cancelPurchaseOrder(actor, id, str(fd, "reason") || "Cancelada por el usuario");
    refresh();
    return { ok: true, message: "Orden cancelada." };
  });
}

export async function receiveGoodsAction(_: FormState, fd: FormData): Promise<FormState> {
  const res = await runAction(async () => {
    const { actor } = await requireTenant("purchases.receive");
    const lines = [];
    for (const l of readLines(fd, 30)) {
      let productId = l.productId;
      if (!productId) productId = (await resolveProductCode(actor, l.productCode!)).product.id;
      lines.push({
        purchaseOrderLineId: l.poLineId || undefined,
        productId: productId!,
        quantity: l.quantity || "0",
        unit: l.unit || "UND",
        unitPrice: l.unitPrice || "0",
        lotNumber: l.lotNumber,
        expiresAt: l.expiresAt,
      });
    }
    const r = await receiveGoods(actor, {
      idempotencyKey: str(fd, "idempotencyKey"),
      purchaseOrderId: str(fd, "purchaseOrderId") || undefined,
      supplierId: str(fd, "supplierId"),
      warehouseId: str(fd, "warehouseId"),
      currency: str(fd, "currency") === "VES" ? "VES" : "USD",
      supplierInvoice: str(fd, "supplierInvoice") || undefined,
      additionalCosts: str(fd, "additionalCosts") || undefined,
      notes: str(fd, "notes") || undefined,
      lines,
    });
    refresh();
    return { ok: true, data: r.receiptId };
  });
  if (res.ok) redirect(`/app/recepciones/${res.data}`);
  return res;
}

export async function updateSettingsAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const { actor } = await requireTenant("tenant.settings.manage");
    await updateTenantSettings(actor, {
      baseCurrency: str(fd, "baseCurrency") === "VES" ? "VES" : "USD",
      adjustmentApprovalThreshold: str(fd, "threshold"),
      allowNegativeStock: fd.get("allowNegativeStock") === "on",
      mfaRequiredForAll: fd.get("mfaRequiredForAll") === "on",
      expiryAlertDays: fd.getAll("expiryAlertDays").map((v) => Number(v)),
      alertEmailEnabled: fd.get("alertEmailEnabled") === "on",
    });
    refresh();
    return { ok: true, message: "Configuración guardada." };
  });
}

export async function createTaxRateAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const { actor } = await requireTenant("tenant.settings.manage");
    await createTaxRate(actor, { code: str(fd, "code"), name: str(fd, "name"), rate: str(fd, "rate"), validFrom: str(fd, "validFrom") });
    refresh();
    return { ok: true, message: "Alícuota creada." };
  });
}

export async function toggleTaxRateAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const { actor } = await requireTenant("tenant.settings.manage");
    await setTaxRateActive(actor, str(fd, "taxRateId"), str(fd, "active") === "true");
    refresh();
    return { ok: true, message: "Alícuota actualizada." };
  });
}

export async function updateProductCommercialAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const { actor } = await requireTenant("products.write");
    await updateProductCommercial(actor, str(fd, "productId"), {
      referencePrice: str(fd, "referencePrice") || null,
      referenceCurrency: str(fd, "referenceCurrency") === "VES" ? "VES" : "USD",
      preferredSupplierId: str(fd, "preferredSupplierId") || null,
    });
    refresh();
    return { ok: true, message: "Datos comerciales guardados." };
  });
}

export async function markAlertsReadAction(_: FormState): Promise<FormState> {
  return runAction(async () => {
    const { actor } = await requireTenant("inventory.read");
    await markNotificationsRead(actor);
    refresh();
    return { ok: true, message: "Alertas marcadas como leídas." };
  });
}
