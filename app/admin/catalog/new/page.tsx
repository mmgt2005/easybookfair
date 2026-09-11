"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCatalogItem } from "../actions";
import { compressImage } from "@/lib/compressImage";
import { Button, Card, Input, Select, Textarea } from "@/components/ui";

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
          <Select name="item_type" defaultValue="book">
            <option value="book">Book</option>
            <option value="merchandise">Merchandise</option>
          </Select>
          <Input name="title" required placeholder="Title" />
          <div className="grid grid-cols-2 gap-2">
            <Input name="sku" placeholder="SKU" />
            <Input name="isbn" placeholder="ISBN (books only)" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input name="cost" type="number" step="0.01" required placeholder="Wholesale cost" />
            <Input name="price" type="number" step="0.01" required placeholder="Retail price" />
          </div>
          <label className="text-xs font-semibold text-neutral-600">
            Image (resized/compressed automatically before upload)
            <input
              name="image"
              type="file"
              accept="image/*"
              className="mt-1 block w-full text-sm"
            />
          </label>
          <Input name="category" placeholder="Category" />
          <Input name="tags" placeholder="Tags (comma-separated)" />
          <Textarea name="description" placeholder="Description" />
          <div className="grid grid-cols-3 gap-2">
            <Input name="weight_oz" type="number" step="0.01" placeholder="Weight (oz)" />
            <Input name="lead_time_days" type="number" defaultValue={0} placeholder="Lead time (days)" />
            <Input name="stock_on_hand" type="number" defaultValue={0} placeholder="Stock on hand" />
          </div>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Adding…" : "Add item"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
