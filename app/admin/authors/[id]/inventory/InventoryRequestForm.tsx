"use client";

import { useState } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";

type EligibleCatalogItem = { id: string; title: string; cost: number; stock_on_hand: number };

// Prefills wholesale_cost_per_unit from the selected item's catalog cost
// (plain client state, no server round trip — cost isn't RLS-sensitive
// data beyond what this page already fetched) — still admin-editable
// before submit, since the stored value is a snapshot, not a live
// reference to catalog_items.cost (see migration 0071's own comment).
export function InventoryRequestForm({
  action,
  items,
}: {
  action: (formData: FormData) => void;
  items: EligibleCatalogItem[];
}) {
  const [selectedId, setSelectedId] = useState(items[0]?.id ?? "");
  const selected = items.find((i) => i.id === selectedId) ?? items[0];

  return (
    <form action={action} className="mt-2 flex flex-col gap-3">
      <Field label="Book">
        <Select
          name="catalog_item_id"
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
        >
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title} (stock: {item.stock_on_hand})
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Quantity">
        <Input name="quantity_requested" type="number" min={1} step={1} required defaultValue={1} />
      </Field>
      <Field label="Wholesale cost per unit" hint="Prefilled from the catalog, still editable.">
        <Input
          key={selected?.id}
          name="wholesale_cost_per_unit"
          type="number"
          min={0}
          step="0.01"
          required
          defaultValue={selected?.cost.toFixed(2)}
        />
      </Field>
      <Field
        label="Terms (optional)"
        hint="Whatever applies — shipping deadline, legal language, etc. This app doesn't generate or validate terms; write whatever you need."
      >
        <Textarea name="terms_text" rows={4} />
      </Field>
      <Button type="submit" size="sm">
        Send request
      </Button>
    </form>
  );
}
