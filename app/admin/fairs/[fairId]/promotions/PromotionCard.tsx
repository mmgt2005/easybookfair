"use client";

import { useState } from "react";
import { togglePromotionActive, deletePromotion, updatePromotion } from "./actions";
import { PromotionForm } from "./PromotionForm";
import { Badge, Button, Card } from "@/components/ui";
import type { BundleConfig, PercentConfig } from "@/lib/promotions";

type Promotion = {
  id: string;
  name: string;
  kind: "percent" | "bundle";
  config: PercentConfig | BundleConfig;
  active: boolean;
  starts_at: string | null;
  ends_at: string | null;
};

export function PromotionCard({
  fairId,
  promotion,
  items,
  description,
}: {
  fairId: string;
  promotion: Promotion;
  items: { id: string; title: string }[];
  description: string;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    const updateForPromo = updatePromotion.bind(null, fairId, promotion.id);
    return (
      <div className="max-w-lg">
        <PromotionForm
          items={items}
          action={updateForPromo}
          initial={promotion}
          title={`Edit "${promotion.name}"`}
          submitLabel="Save changes"
        />
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="mt-2 text-xs font-semibold text-neutral-500 hover:text-neutral-700"
        >
          Cancel
        </button>
      </div>
    );
  }

  const toggleForPromo = togglePromotionActive.bind(null, fairId, promotion.id, !promotion.active);
  const deleteForPromo = deletePromotion.bind(null, fairId, promotion.id);

  return (
    <Card className="max-w-lg">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-heading font-bold text-neutral-900">{promotion.name}</h3>
          <p className="text-sm text-neutral-600">{description}</p>
          {(promotion.starts_at || promotion.ends_at) && (
            <p className="text-xs text-neutral-500">
              {promotion.starts_at ?? "no start"} – {promotion.ends_at ?? "no end"}
            </p>
          )}
        </div>
        <Badge tone={promotion.active ? "success" : "neutral"}>
          {promotion.active ? "active" : "inactive"}
        </Badge>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
          Edit
        </Button>
        <form action={toggleForPromo}>
          <Button type="submit" size="sm" variant="outline">
            {promotion.active ? "Deactivate" : "Activate"}
          </Button>
        </form>
        <form action={deleteForPromo}>
          <Button type="submit" size="sm" variant="ghost">
            Delete
          </Button>
        </form>
      </div>
    </Card>
  );
}
