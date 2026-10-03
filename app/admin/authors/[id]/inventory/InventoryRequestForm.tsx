"use client";

import { useState } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { renderInventoryTermsTemplate } from "@/lib/inventoryTerms";

type EligibleCatalogItem = { id: string; title: string; cost: number; stock_on_hand: number };
type Line = { catalogItemId: string; quantity: number; cost: number };

function firstLine(items: EligibleCatalogItem[]): Line {
  return { catalogItemId: items[0]?.id ?? "", quantity: 1, cost: items[0]?.cost ?? 0 };
}

// Lets one proposal cover more than one book at once (author_inventory_
// request_items, migration 0074) — a repeatable line-item list rather
// than a single book/quantity/cost, submitted as one JSON blob
// (items_json) the server action parses, since this form has no natural
// "items[0][...]" field-name convention elsewhere in this app to match.
export function InventoryRequestForm({
  action,
  items,
  authorName,
  termsTemplate,
}: {
  action: (formData: FormData) => void;
  items: EligibleCatalogItem[];
  authorName: string;
  termsTemplate: string;
}) {
  const [lines, setLines] = useState<Line[]>([firstLine(items)]);

  function updateLine(index: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, firstLine(items)]);
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  const preview = renderInventoryTermsTemplate(termsTemplate, {
    lineItems: lines.map((line) => {
      const book = items.find((i) => i.id === line.catalogItemId);
      return {
        bookTitle: book?.title ?? "Unknown book",
        quantity: line.quantity,
        wholesaleCostPerUnit: line.cost,
        wholesaleAmountTotal: line.quantity * line.cost,
      };
    }),
    authorName,
    requestDate: new Date().toLocaleDateString(),
  });

  return (
    <form action={action} className="mt-2 flex flex-col gap-3">
      <input type="hidden" name="items_json" value={JSON.stringify(lines)} />
      {lines.map((line, index) => {
        const selected = items.find((i) => i.id === line.catalogItemId);
        return (
          <div
            key={index}
            className="flex flex-col gap-2 rounded-xl border border-neutral-200 p-3 sm:flex-row sm:items-end"
          >
            <Field label="Book">
              <Select
                value={line.catalogItemId}
                onChange={(e) => {
                  const book = items.find((i) => i.id === e.target.value);
                  updateLine(index, { catalogItemId: e.target.value, cost: book?.cost ?? 0 });
                }}
              >
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title} (stock: {item.stock_on_hand})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Quantity">
              <Input
                type="number"
                min={1}
                step={1}
                value={line.quantity}
                onChange={(e) => updateLine(index, { quantity: Number(e.target.value) || 1 })}
              />
            </Field>
            <Field label="Cost/unit" hint="Prefilled from the catalog, still editable.">
              <Input
                key={selected?.id}
                type="number"
                min={0}
                step="0.01"
                value={line.cost}
                onChange={(e) => updateLine(index, { cost: Number(e.target.value) || 0 })}
              />
            </Field>
            {lines.length > 1 && (
              <Button type="button" variant="outline" size="sm" onClick={() => removeLine(index)}>
                Remove
              </Button>
            )}
          </div>
        );
      })}
      <Button type="button" variant="outline" size="sm" onClick={addLine}>
        + Add another book
      </Button>

      <Field
        label="Standard terms (preview)"
        hint="Edit the standard wording from Inventory request terms, in the admin nav."
      >
        <Textarea value={preview} readOnly rows={12} className="font-mono text-xs" />
      </Field>

      <Button type="submit" size="sm">
        Send request
      </Button>
    </form>
  );
}
