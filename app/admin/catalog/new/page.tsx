import { createCatalogItem } from "../actions";

export default function NewCatalogItemPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">Add catalog item</h1>
      <form action={createCatalogItem} className="flex max-w-md flex-col gap-2">
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
        <input name="image_url" placeholder="Image URL" className="rounded border border-neutral-300 px-2 py-1" />
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
        <button type="submit" className="rounded bg-neutral-900 px-3 py-1.5 text-white">
          Add item
        </button>
      </form>
    </div>
  );
}
