import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { receiveStock } from "./actions";

export default async function CatalogPage() {
  const supabase = await createClient();
  const { data: items, error } = await supabase
    .from("catalog_items")
    .select("id, item_type, title, sku, cost, price, stock_on_hand, image_url")
    .order("title");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Catalog</h1>
        <div className="flex gap-4 text-sm">
          <Link href="/admin/catalog/new" className="underline">
            Add item
          </Link>
          <Link href="/admin/catalog/upload" className="underline">
            Bulk upload
          </Link>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error.message}</p>}

      <table className="w-full max-w-3xl text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-left">
            <th className="py-1 pr-4" />
            <th className="py-1 pr-4">Title</th>
            <th className="py-1 pr-4">Type</th>
            <th className="py-1 pr-4">SKU</th>
            <th className="py-1 pr-4">Cost</th>
            <th className="py-1 pr-4">Price</th>
            <th className="py-1 pr-4">Stock</th>
            <th className="py-1 pr-4">Receive stock</th>
          </tr>
        </thead>
        <tbody>
          {items?.map((item) => (
            <tr key={item.id} className="border-b border-neutral-100">
              <td className="py-1 pr-4">
                {/* Plain <img>, not next/image: avoids needing a remote-pattern
                    config for a Supabase project URL that varies per deploy. */}
                {item.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.image_url} alt="" className="h-10 w-10 rounded object-cover" />
                )}
              </td>
              <td className="py-1 pr-4">{item.title}</td>
              <td className="py-1 pr-4">{item.item_type}</td>
              <td className="py-1 pr-4">{item.sku}</td>
              <td className="py-1 pr-4">${item.cost}</td>
              <td className="py-1 pr-4">${item.price}</td>
              <td className="py-1 pr-4">{item.stock_on_hand}</td>
              <td className="py-1 pr-4">
                <form action={receiveStock} className="flex gap-1">
                  <input type="hidden" name="catalog_item_id" value={item.id} />
                  <input
                    name="quantity"
                    type="number"
                    min={1}
                    required
                    placeholder="Qty"
                    className="w-16 rounded border border-neutral-300 px-1 py-0.5"
                  />
                  <button type="submit" className="rounded border border-neutral-400 px-2 py-0.5 text-xs">
                    Receive
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
