"use client";

import { Button } from "@/components/ui";

// window.print() covers both "print" and "download" (browsers' own
// print-to-PDF) — no PDF-generation library needed for a receipt this
// simple.
export function PrintButton() {
  return (
    <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
      Print / save as PDF
    </Button>
  );
}
