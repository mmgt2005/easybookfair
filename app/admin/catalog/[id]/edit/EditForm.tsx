"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateCatalogItem } from "../../actions";
import { compressImage } from "@/lib/compressImage";

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
      <h1 className="text-lg font-semibold">Edit catalog item</h1>
      {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <form onSubmit={handleSubmit} className="flex max-w-md flex-col gap-2">
        <select
          name="item_type"
          defaultValue={item.item_type}
          className="rounded border border-neutral-300 px-2 py-1"
        >
          <option value="book">Book</option>
          <option value="merchandise">Merchandise</option>
        </select>
        <input
          name="title"
          required
          defaultValue={item.title}
          placeholder="Title"
          className="rounded border border-neutral-300 px-2 py-1"
        />
        <div className="grid grid-cols-2 gap-2">
          <input
            name="sku"
            defaultValue={item.sku ?? ""}
            placeholder="SKU"
            className="rounded border border-neutral-300 px-2 py-1"
          />
          <input
            name="isbn"
            defaultValue={item.isbn ?? ""}
            placeholder="ISBN (books only)"
            className="rounded border border-neutral-300 px-2 py-1"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input
            name="cost"
            type="number"
            step="0.01"
            required
            defaultValue={item.cost}
            placeholder="Wholesale cost"
            className="rounded border border-neutral-300 px-2 py-1"
          />
          <input
            name="price"
            type="number"
            step="0.01"
            required
            defaultValue={item.price}
            placeholder="Retail price"
            className="rounded border border-neutral-300 px-2 py-1"
          />
        </div>
        <label className="text-xs text-neutral-600">
          {item.image_url ? (
            <span className="mb-1 flex items-center gap-2">
              Current image:
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.image_url} alt="" className="h-10 w-10 rounded object-cover" />
            </span>
          ) : (
            "Image"
          )}
          <input name="image" type="file" accept="image/*" className="mt-1 block w-full text-sm" />
          <span className="text-neutral-400">Leave blank to keep the current image.</span>
        </label>
        <input
          name="category"
          defaultValue={item.category ?? ""}
          placeholder="Category"
          className="rounded border border-neutral-300 px-2 py-1"
        />
        <input
          name="tags"
          defaultValue={(item.tags ?? []).join(", ")}
          placeholder="Tags (comma-separated)"
          className="rounded border border-neutral-300 px-2 py-1"
        />
        <textarea
          name="description"
          defaultValue={item.description ?? ""}
          placeholder="Description"
          className="rounded border border-neutral-300 px-2 py-1"
        />
        <div className="grid grid-cols-3 gap-2">
          <input
            name="weight_oz"
            type="number"
            step="0.01"
            defaultValue={item.weight_oz ?? ""}
            placeholder="Weight (oz)"
            className="rounded border border-neutral-300 px-2 py-1"
          />
          <input
            name="lead_time_days"
            type="number"
            defaultValue={item.lead_time_days}
            placeholder="Lead time (days)"
            className="rounded border border-neutral-300 px-2 py-1"
          />
          <input
            name="stock_on_hand"
            type="number"
            defaultValue={item.stock_on_hand}
            placeholder="Stock on hand"
            className="rounded border border-neutral-300 px-2 py-1"
          />
        </div>
        <p className="text-xs text-neutral-500">
          Prefer the &quot;Receive&quot; action on the catalog list for routine
          restocking — this field here just overwrites the count directly,
          for corrections.
        </p>
        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-neutral-900 px-3 py-1.5 text-white disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Save changes"}
        </button>
      </form>
    </div>
  );
}
