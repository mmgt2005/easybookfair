"use client";

import { useState } from "react";
import { Button, Card, Field, Input, Select } from "@/components/ui";
import type { BundleConfig, PercentConfig } from "@/lib/promotions";

type Item = { id: string; title: string };

type Initial = {
  name: string;
  kind: "percent" | "bundle";
  config: PercentConfig | BundleConfig;
  active: boolean;
  starts_at: string | null;
  ends_at: string | null;
};

export function PromotionForm({
  items,
  action,
  initial,
  title = "New promotion",
  submitLabel = "Create promotion",
}: {
  items: Item[];
  action: (formData: FormData) => void | Promise<void>;
  initial?: Initial;
  title?: string;
  submitLabel?: string;
}) {
  const [kind, setKind] = useState<"percent" | "bundle">(initial?.kind ?? "percent");

  // Only meaningful when the current `kind` still matches what was saved —
  // switching kind while editing starts that side blank, same as creating
  // a new promotion of that kind.
  const percentConfig = initial?.kind === "percent" ? (initial.config as PercentConfig) : undefined;
  const bundleConfig = initial?.kind === "bundle" ? (initial.config as BundleConfig) : undefined;
  const selectedIds = new Set(
    kind === "percent" ? (percentConfig?.catalog_item_ids ?? []) : (bundleConfig?.catalog_item_ids ?? []),
  );

  return (
    <Card className="max-w-lg">
      <h2 className="font-heading font-bold text-neutral-900">{title}</h2>
      <form action={action} className="mt-2 flex flex-col gap-3">
        <Input
          name="name"
          required
          placeholder="e.g. Buy 3 get a discount"
          defaultValue={initial?.name}
        />

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
              <Input
                name="percent_off"
                type="number"
                min={1}
                max={100}
                required
                placeholder="20"
                defaultValue={percentConfig?.percent_off}
              />
            </Field>
            <Field label="Min. quantity" hint="Across the eligible items below">
              <Input
                name="min_quantity"
                type="number"
                min={1}
                defaultValue={percentConfig?.min_quantity ?? 1}
              />
            </Field>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Buy quantity">
              <Input
                name="buy_quantity"
                type="number"
                min={1}
                required
                placeholder="3"
                defaultValue={bundleConfig?.buy_quantity}
              />
            </Field>
            <Field label="Bundle price ($)">
              <Input
                name="bundle_price"
                type="number"
                step="0.01"
                min={0}
                required
                placeholder="15.00"
                defaultValue={bundleConfig?.bundle_price}
              />
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
                <input
                  type="checkbox"
                  name="catalog_item_ids"
                  value={item.id}
                  defaultChecked={selectedIds.has(item.id)}
                />
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
            <Input name="starts_at" type="date" defaultValue={initial?.starts_at?.slice(0, 10) ?? ""} />
          </Field>
          <Field label="Ends (optional)">
            <Input name="ends_at" type="date" defaultValue={initial?.ends_at?.slice(0, 10) ?? ""} />
          </Field>
        </div>

        <label className="flex items-center gap-2 text-sm text-neutral-700">
          <input type="checkbox" name="active" defaultChecked={initial?.active ?? true} />
          Active
        </label>

        <Button type="submit">{submitLabel}</Button>
      </form>
    </Card>
  );
}
