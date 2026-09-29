"use client";

import { useState } from "react";
import { Field, Input, Select } from "@/components/ui";

type StateRate = { state_code: string; state_name: string; base_rate: number };

// The actual checkout math only ever reads sales_tax_pct — this component
// just helps an org fill that one field in. Picking a state suggests that
// state's base rate as a starting point ONLY when the rate field is still
// empty — it never overwrites a rate that's already set, since that rate
// may already be the state base plus a manually-added county/city amount.
// (Bug fixed here: this previously reset the field to the raw state base
// rate on every state selection via a key-remount, silently discarding an
// already-correct combined rate — e.g. an org sets 8.25% [7.25% CA base +
// 1% county], later reselects California in the dropdown, and the field
// snapped back down to 7.25%, dropping the county portion, unless they
// noticed before saving.) This component deliberately doesn't try to look
// up a precise county/city rate itself — see the migration 0064 plan's
// note on why a full jurisdiction table isn't something this app takes
// on. The "look up your local rate" link is a constructed search query,
// not a hardcoded per-state government URL, so it can't go stale or point
// at the wrong page the way a curated list of 50 links eventually would.
export function TaxRateFields({
  rates,
  initialState,
  initialCounty,
  initialCity,
  initialPct,
}: {
  rates: StateRate[];
  initialState: string | null;
  initialCounty: string | null;
  initialCity: string | null;
  initialPct: number | null;
}) {
  const [stateCode, setStateCode] = useState(initialState ?? "");
  const [pctValue, setPctValue] = useState(initialPct != null ? String(initialPct) : "");
  const selected = rates.find((r) => r.state_code === stateCode);

  function handleStateChange(code: string) {
    setStateCode(code);
    // Only suggest the base rate into an empty field — never overwrite an
    // already-entered rate, which may already include a county/city add-on.
    if (pctValue.trim() === "") {
      const rate = rates.find((r) => r.state_code === code);
      if (rate) setPctValue(String(rate.base_rate));
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-neutral-50 p-3">
      <p className="text-xs font-semibold text-neutral-600">
        Sales tax (optional) — applied to every sale channel at checkout
      </p>
      <Field label="State (for tax reference)">
        <Select
          name="tax_state"
          value={stateCode}
          onChange={(e) => handleStateChange(e.target.value)}
        >
          <option value="">— none —</option>
          {rates.map((r) => (
            <option key={r.state_code} value={r.state_code}>
              {r.state_name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="County (optional)">
          <Input name="tax_county" defaultValue={initialCounty ?? ""} />
        </Field>
        <Field label="City (optional)">
          <Input name="tax_city" defaultValue={initialCity ?? ""} />
        </Field>
      </div>
      {selected && (
        <p className="text-xs text-neutral-500">
          {selected.state_name}&apos;s state base rate is {(selected.base_rate * 100).toFixed(2)}%
          — add your county/city rate on top.{" "}
          <a
            href={`https://www.google.com/search?q=${encodeURIComponent(
              `${selected.state_name} sales tax rate lookup by address`,
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-accent-600 hover:underline"
          >
            🔍 Look up your local rate →
          </a>
        </p>
      )}
      <Field label="Sales tax rate applied at checkout (0–1, blank = no tax collected)">
        <Input
          name="sales_tax_pct"
          type="number"
          step="0.0001"
          min={0}
          max={1}
          value={pctValue}
          onChange={(e) => setPctValue(e.target.value)}
          placeholder="e.g. 0.0825 for 8.25%"
        />
      </Field>
    </div>
  );
}
