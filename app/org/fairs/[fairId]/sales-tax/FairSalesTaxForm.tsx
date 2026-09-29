"use client";

import { useState, useTransition } from "react";
import { updateFairSalesTax } from "@/app/admin/fairs/actions";
import { TaxRateFields } from "@/app/admin/fairs/[fairId]/edit/TaxRateFields";
import { Button } from "@/components/ui";

type StateRate = { state_code: string; state_name: string; base_rate: number };

// Next.js redacts a thrown Server Action error's message in production —
// updateFairSalesTax returns { error } as ordinary data instead (same
// pattern as FundraiserGoalForm.tsx), so this needs useTransition + a
// plain function component rather than a bare <form action={...}>.
export function FairSalesTaxForm({
  fairId,
  rates,
  initialState,
  initialCountyPct,
  initialCityPct,
}: {
  fairId: string;
  rates: StateRate[];
  initialState: string | null;
  initialCountyPct: number | null;
  initialCityPct: number | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleSubmit(formData: FormData) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateFairSalesTax(fairId, formData);
      if (result.error) {
        setError(result.error);
      } else {
        setSaved(true);
      }
    });
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-3">
      <TaxRateFields
        rates={rates}
        initialState={initialState}
        initialCountyPct={initialCountyPct}
        initialCityPct={initialCityPct}
      />
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Saving…" : "Save sales tax"}
        </Button>
        {saved && !error && <span className="text-xs text-green-700">Saved!</span>}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </form>
  );
}
