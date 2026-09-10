"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCatalogItem } from "../actions";
import { compressImage } from "@/lib/compressImage";

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
      <h1 className="text-lg font-semibold">Add catalog item</h1>
      {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <form onSubmit={handleSubmit} className="flex max-w-md flex-col gap-2">
        <select name="item_type" defaultValue="book" className="rounded border border-neutral-300 px-2 py-1">
          <option value="book">Book</option>
          <option value="merchandise">Merchandise</option>
        </select>
        <input name="title" required placeholder="Title" className="rounded border border-neutral-300 px-2 py-1" />
        <div className="grid grid-cols-2 gap-2">
          <input name="sku" placeholder="SKU" className="rounded border border-neutral-300 px-2 py-1" />
          <input name="isbn" placeholder="ISBN (books only)" className="rounded border border-neutral-300 px-2 py-1" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input
            name="cost"
            type="number"
            step="0.01"
            required
            placeholder="Wholesale cost"
            className="rounded border border-neutral-300 px-2 py-1"
          />
          <input
            name="price"
            type="number"
            step="0.01"
            required
            placeholder="Retail price"
            className="rounded border border-neutral-300 px-2 py-1"
          />
        </div>
        <label className="text-xs text-neutral-600">
          Image (resized/compressed automatically before upload)
          <input
            name="image"
            type="file"
            accept="image/*"
            className="mt-1 block w-full text-sm"
          />
        </label>
        <input name="category" placeholder="Category" className="rounded border border-neutral-300 px-2 py-1" />
        <input
          name="tags"
          placeholder="Tags (comma-separated)"
          className="rounded border border-neutral-300 px-2 py-1"
        />
        <textarea
          name="description"
          placeholder="Description"
          className="rounded border border-neutral-300 px-2 py-1"
        />
        <div className="grid grid-cols-3 gap-2">
          <input
            name="weight_oz"
            type="number"
            step="0.01"
            placeholder="Weight (oz)"
            className="rounded border border-neutral-300 px-2 py-1"
          />
          <input
            name="lead_time_days"
            type="number"
            defaultValue={0}
            placeholder="Lead time (days)"
            className="rounded border border-neutral-300 px-2 py-1"
          />
          <input
            name="stock_on_hand"
            type="number"
            defaultValue={0}
            placeholder="Stock on hand"
            className="rounded border border-neutral-300 px-2 py-1"
          />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-neutral-900 px-3 py-1.5 text-white disabled:opacity-50"
        >
          {isPending ? "Adding…" : "Add item"}
        </button>
      </form>
    </div>
  );
}
