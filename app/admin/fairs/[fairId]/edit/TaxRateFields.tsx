"use client";

import { useMemo, useState } from "react";
import { Field, Input, Select } from "@/components/ui";

type StateRate = { state_code: string; state_name: string; base_rate: number };

// The actual checkout math only ever reads fairs.sales_tax_pct — this
// component's job is to help arrive at that one number automatically:
// state base rate (from sales_tax_state_rates) + county rate + city
// rate, all summed and written by updateFair() (app/admin/fairs/
// actions.ts) server-side, never trusted from this client component —
// same "recompute money server-side" convention already used for
// checkout pricing elsewhere in this app. The combined-rate line below
// is a live preview only; saving is what actually persists it.
//
// This deliberately still doesn't look up what a county's/city's rate
// *is* — that's still on staff to find (the search link below still
// helps with that) — it only does the addition once they have the
// numbers, removing the manual-math step and the class of bug that step
// caused (a previous version stored one pre-combined number, which
// silently reset to just the state's bare base rate any time the state
// dropdown was touched again).
export function TaxRateFields({
  rates,
  initialState,
  initialCountyPct,
  initialCityPct,
}: {
  rates: StateRate[];
  initialState: string | null;
  initialCountyPct: number | null;
  initialCityPct: number | null;
}) {
  const [stateCode, setStateCode] = useState(initialState ?? "");
  const [countyPct, setCountyPct] = useState(
    initialCountyPct != null ? String(initialCountyPct) : "",
  );
  const [cityPct, setCityPct] = useState(initialCityPct != null ? String(initialCityPct) : "");
  const selected = rates.find((r) => r.state_code === stateCode);

  const combinedPct = useMemo(() => {
    const base = selected?.base_rate ?? 0;
    const county = Number(countyPct) || 0;
    const city = Number(cityPct) || 0;
    return base + county + city;
  }, [selected, countyPct, cityPct]);

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-neutral-50 p-3">
      <p className="text-xs font-semibold text-neutral-600">
        Sales tax (optional) — applied to every sale channel at checkout
      </p>
      <Field label="State (for the base rate)">
        <Select name="tax_state" value={stateCode} onChange={(e) => setStateCode(e.target.value)}>
          <option value="">— none —</option>
          {rates.map((r) => (
            <option key={r.state_code} value={r.state_code}>
              {r.state_name}
            </option>
          ))}
        </Select>
      </Field>
      {selected && (
        <p className="text-xs text-neutral-500">
          {selected.state_name}&apos;s state base rate is {(selected.base_rate * 100).toFixed(2)}%
          — look up your county/city add-on below.{" "}
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
      <div className="grid grid-cols-2 gap-2">
        <Field label="County tax rate (0–1, optional)">
          <Input
            name="tax_county_pct"
            type="number"
            step="0.0001"
            min={0}
            max={1}
            value={countyPct}
            onChange={(e) => setCountyPct(e.target.value)}
            placeholder="e.g. 0.0100 for 1%"
          />
        </Field>
        <Field label="City tax rate (0–1, optional)">
          <Input
            name="tax_city_pct"
            type="number"
            step="0.0001"
            min={0}
            max={1}
            value={cityPct}
            onChange={(e) => setCityPct(e.target.value)}
            placeholder="e.g. 0.0050 for 0.5%"
          />
        </Field>
      </div>
      <p className="text-sm font-semibold text-neutral-800">
        Combined rate applied at checkout: {(combinedPct * 100).toFixed(2)}%
        {combinedPct === 0 && " — no tax will be collected"}
      </p>
    </div>
  );
}
