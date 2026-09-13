"use client";

import { useState } from "react";
import { Field, Input } from "@/components/ui";

// Live client-side preview only — the database computes the authoritative
// 65% wholesale_price itself (a generated column, migration 0040) so it
// can never be submitted independently of the retail price.
export function PriceInput() {
  const [retail, setRetail] = useState("");
  const retailNum = Number(retail);
  const wholesale =
    Number.isFinite(retailNum) && retailNum > 0 ? (retailNum * 0.65).toFixed(2) : null;

  return (
    <Field label="Suggested retail price ($)">
      <Input
        name="suggested_retail_price"
        type="number"
        step="0.01"
        min={0}
        required
        value={retail}
        onChange={(e) => setRetail(e.target.value)}
      />
      {wholesale && (
        <p className="mt-1 text-xs text-neutral-500">
          You&apos;ll be paid the wholesale price: <strong>${wholesale}</strong> per unit sold
          (65% of retail).
        </p>
      )}
    </Field>
  );
}
