"use server";

import { commitProductImport, previewProductImport, type ImportMode, type ImportPreview } from "@rc/domain";
import { revalidatePath } from "next/cache";
import { runAction, str, type FormState } from "@/server/actions";
import { requireTenant } from "@/server/session";

export type PreviewState = FormState<ImportPreview & { committed?: { created: number; updated: number; skipped: number } }>;

export async function importAction(_: PreviewState, fd: FormData): Promise<PreviewState> {
  return runAction(async () => {
    const { actor } = await requireTenant("products.write");
    const text = str(fd, "csv");
    const mode: ImportMode = str(fd, "mode") === "actualizar" ? "actualizar" : "crear";
    if (str(fd, "intent") === "importar") {
      const committed = await commitProductImport(actor, text, mode);
      revalidatePath("/app/productos");
      return {
        ok: true,
        message: `Importación completada: ${committed.created} creado(s), ${committed.updated} actualizado(s), ${committed.skipped} omitido(s).`,
        data: { rows: [], counts: { crear: 0, actualizar: 0, omitir: 0, error: 0 }, delimiter: ";", committed },
      };
    }
    const preview = await previewProductImport(actor, text, mode);
    return { ok: true, data: preview };
  });
}
