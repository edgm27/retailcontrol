"use client";

import { Button } from "@rc/ui";

export function PrintButton() {
  return (
    <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
      Imprimir / PDF
    </Button>
  );
}
