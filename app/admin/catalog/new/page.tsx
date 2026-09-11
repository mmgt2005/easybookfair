"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCatalogItem } from "../actions";
import { compressImage } from "@/lib/compressImage";
import { Button, Card, Field, Input, Select, Textarea } from "@/components/ui";

export default function NewCatalogItemPage() {
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
        await createCatalogItem(formData);
        router.push("/admin/catalog");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-2xl font-bold text-neutral-900">Add catalog item 📖</h1>
      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <Card className="max-w-md">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Field label="Item type">
            <Select name="item_type" defaultValue="book">
              <option value="book">Book</option>
              <option value="merchandise">Merchandise</option>
            </Select>
          </Field>
          <Field label="Title">
            <Input name="title" required />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="SKU">
              <Input name="sku" />
            </Field>
            <Field label="ISBN (books only)">
              <Input name="isbn" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Wholesale cost">
              <Input name="cost" type="number" step="0.01" required />
            </Field>
            <Field label="Retail price">
              <Input name="price" type="number" step="0.01" required />
            </Field>
          </div>
          <Field label="Image" hint="Resized/compressed automatically before upload">
            <input
              name="image"
              type="file"
              accept="image/*"
              className="mt-1 block w-full text-sm font-normal"
            />
          </Field>
          <Field label="Category">
            <Input name="category" />
          </Field>
          <Field label="Tags" hint="Comma-separated">
            <Input name="tags" />
          </Field>
          <Field label="Description">
            <Textarea name="description" />
          </Field>
          <div className="flex flex-col gap-2 rounded-lg bg-neutral-50 p-3">
            <p className="text-xs font-semibold text-neutral-600">
              Packing &amp; shipping — dimensions and weight drive the packing
              suggestion (both optional, but fill in what you can); lead time
              drives allocation availability checks.
            </p>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Length (in)">
                <Input name="length_in" type="number" step="0.1" />
              </Field>
              <Field label="Width (in)">
                <Input name="width_in" type="number" step="0.1" />
              </Field>
              <Field label="Height (in)">
                <Input name="height_in" type="number" step="0.1" />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Weight (oz)">
                <Input name="weight_oz" type="number" step="0.01" />
              </Field>
              <Field label="Lead time (days)">
                <Input name="lead_time_days" type="number" defaultValue={0} />
              </Field>
              <Field label="Stock on hand">
                <Input name="stock_on_hand" type="number" defaultValue={0} />
              </Field>
            </div>
          </div>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Adding…" : "Add item"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
