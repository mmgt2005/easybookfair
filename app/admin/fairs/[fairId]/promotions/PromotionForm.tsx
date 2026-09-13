"use client";

import { useState } from "react";
import { Button, Card, Field, Input, Select } from "@/components/ui";

type Item = { id: string; title: string };

export function PromotionForm({
  items,
  action,
}: {
  items: Item[];
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [kind, setKind] = useState<"percent" | "bundle">("percent");

  return (
    <Card className="max-w-lg">
      <h2 className="font-heading font-bold text-neutral-900">New promotion</h2>
      <form action={action} className="mt-2 flex flex-col gap-3">
        <Input name="name" required placeholder="e.g. Buy 3 get a discount" />

        <Field label="Kind">
          <Select
            name="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as "percent" | "bundle")}
          >
            <option value="percent">Percent off</option>
            <option value="bundle">Bundle (any N for $X)</option>
          </Select>
        </Field>

        {kind === "percent" ? (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Percent off">
              <Input name="percent_off" type="number" min={1} max={100} required placeholder="20" />
            </Field>
            <Field label="Min. quantity" hint="Across the eligible items below">
              <Input name="min_quantity" type="number" min={1} defaultValue={1} />
            </Field>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Buy quantity">
              <Input name="buy_quantity" type="number" min={1} required placeholder="3" />
            </Field>
            <Field label="Bundle price ($)">
              <Input name="bundle_price" type="number" step="0.01" min={0} required placeholder="15.00" />
            </Field>
          </div>
        )}

        <div className="flex flex-col gap-1 rounded-lg bg-neutral-50 p-3">
          <p className="text-xs font-semibold text-neutral-700">
            Eligible items
            {kind === "percent"
              ? " (none selected = applies to every item at this fair)"
              : " (required — the pool the bundle draws from)"}
          </p>
          <div className="max-h-40 overflow-y-auto">
            {items.map((item) => (
              <label key={item.id} className="flex items-center gap-2 py-0.5 text-sm">
                <input type="checkbox" name="catalog_item_ids" value={item.id} />
                {item.title}
              </label>
            ))}
            {items.length === 0 && (
              <p className="text-xs text-neutral-500">No items allocated to this fair yet.</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Starts (optional)">
            <Input name="starts_at" type="date" />
          </Field>
          <Field label="Ends (optional)">
            <Input name="ends_at" type="date" />
          </Field>
        </div>

        <label className="flex items-center gap-2 text-sm text-neutral-700">
          <input type="checkbox" name="active" defaultChecked />
          Active
        </label>

        <Button type="submit">Create promotion</Button>
      </form>
    </Card>
  );
}
