import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function CatalogPage() {
  const supabase = await createClient();
  const { data: items, error } = await supabase
    .from("catalog_items")
    .select("id, item_type, title, sku, cost, price, stock_on_hand")
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
            <th className="py-1 pr-4">Title</th>
            <th className="py-1 pr-4">Type</th>
            <th className="py-1 pr-4">SKU</th>
            <th className="py-1 pr-4">Cost</th>
            <th className="py-1 pr-4">Price</th>
            <th className="py-1 pr-4">Stock</th>
          </tr>
        </thead>
        <tbody>
          {items?.map((item) => (
            <tr key={item.id} className="border-b border-neutral-100">
              <td className="py-1 pr-4">{item.title}</td>
              <td className="py-1 pr-4">{item.item_type}</td>
              <td className="py-1 pr-4">{item.sku}</td>
              <td className="py-1 pr-4">${item.cost}</td>
              <td className="py-1 pr-4">${item.price}</td>
              <td className="py-1 pr-4">{item.stock_on_hand}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
