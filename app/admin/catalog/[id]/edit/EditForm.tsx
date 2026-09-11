"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateCatalogItem } from "../../actions";
import { compressImage } from "@/lib/compressImage";
import { Button, Card, Field, Input, Select, Textarea } from "@/components/ui";

type CatalogItem = {
  id: string;
  item_type: string;
  title: string;
  sku: string | null;
  isbn: string | null;
  cost: number;
  price: number;
  image_url: string | null;
  category: string | null;
  tags: string[] | null;
  description: string | null;
  weight_oz: number | null;
  length_in: number | null;
  width_in: number | null;
  height_in: number | null;
  lead_time_days: number;
  stock_on_hand: number;
};

export default function EditCatalogItemForm({ item }: { item: CatalogItem }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const formData = new FormData(e.currentTarget);
    const imageFile = formData.get("image") as File | null;
    if (imageFile && imageFile.size > 0) {
      const compressed = await compressImage(imageFile);
      formData.set("image", compressed);
    }

    startTransition(async () => {
      try {
        await updateCatalogItem(item.id, formData);
        router.push("/admin/catalog");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-2xl font-bold text-neutral-900">Edit catalog item ✏️</h1>
      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <Card className="max-w-md">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Field label="Item type">
            <Select name="item_type" defaultValue={item.item_type}>
              <option value="book">Book</option>
              <option value="merchandise">Merchandise</option>
            </Select>
          </Field>
          <Field label="Title">
            <Input name="title" required defaultValue={item.title} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="SKU">
              <Input name="sku" defaultValue={item.sku ?? ""} />
            </Field>
            <Field label="ISBN (books only)">
              <Input name="isbn" defaultValue={item.isbn ?? ""} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Wholesale cost">
              <Input name="cost" type="number" step="0.01" required defaultValue={item.cost} />
            </Field>
            <Field label="Retail price">
              <Input name="price" type="number" step="0.01" required defaultValue={item.price} />
            </Field>
          </div>
          <Field
            label={
              item.image_url ? (
                <span className="flex items-center gap-2">
                  Current image:
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.image_url} alt="" className="h-10 w-10 rounded-lg object-cover" />
                </span>
              ) : (
                "Image"
              )
            }
            hint="Leave blank to keep the current image."
          >
            <input name="image" type="file" accept="image/*" className="mt-1 block w-full text-sm font-normal" />
          </Field>
          <Field label="Category">
            <Input name="category" defaultValue={item.category ?? ""} />
          </Field>
          <Field label="Tags" hint="Comma-separated">
            <Input name="tags" defaultValue={(item.tags ?? []).join(", ")} />
          </Field>
          <Field label="Description">
            <Textarea name="description" defaultValue={item.description ?? ""} />
          </Field>
          <div className="flex flex-col gap-2 rounded-lg bg-neutral-50 p-3">
            <p className="text-xs font-semibold text-neutral-600">
              Packing &amp; shipping — dimensions and weight drive the packing
              suggestion (both optional, but fill in what you can); lead time
              drives allocation availability checks.
            </p>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Length (in)">
                <Input name="length_in" type="number" step="0.1" defaultValue={item.length_in ?? ""} />
              </Field>
              <Field label="Width (in)">
                <Input name="width_in" type="number" step="0.1" defaultValue={item.width_in ?? ""} />
              </Field>
              <Field label="Height (in)">
                <Input name="height_in" type="number" step="0.1" defaultValue={item.height_in ?? ""} />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Weight (oz)">
                <Input name="weight_oz" type="number" step="0.01" defaultValue={item.weight_oz ?? ""} />
              </Field>
              <Field label="Lead time (days)">
                <Input name="lead_time_days" type="number" defaultValue={item.lead_time_days} />
              </Field>
              <Field label="Stock on hand">
                <Input name="stock_on_hand" type="number" defaultValue={item.stock_on_hand} />
              </Field>
            </div>
          </div>
          <p className="text-xs text-neutral-500">
            Prefer the &quot;Receive&quot; action on the catalog list for routine
            restocking — this field here just overwrites the count directly,
            for corrections.
          </p>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving…" : "Save changes"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
