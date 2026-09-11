import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { receiveStock } from "./actions";
import { Badge, Button, Card, Input, PageHeader } from "@/components/ui";

export default async function CatalogPage() {
  const supabase = await createClient();
  const { data: items, error } = await supabase
    .from("catalog_items")
    .select("id, item_type, title, sku, cost, price, stock_on_hand, image_url")
    .order("title");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Catalog 📖"
        actions={
          <>
            <Link href="/admin/catalog/new">
              <Button size="sm">+ Add item</Button>
            </Link>
            <Link href="/admin/catalog/upload">
              <Button size="sm" variant="outline">
                Bulk upload
              </Button>
            </Link>
          </>
        }
      />

      {error && <p className="text-sm text-red-600">{error.message}</p>}

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-100 bg-neutral-50 text-left">
              <th className="py-2 pl-4 pr-4" />
              <th className="py-2 pr-4">Title</th>
              <th className="py-2 pr-4">Type</th>
              <th className="py-2 pr-4">SKU</th>
              <th className="py-2 pr-4">Cost</th>
              <th className="py-2 pr-4">Price</th>
              <th className="py-2 pr-4">Stock</th>
              <th className="py-2 pr-4">Receive stock</th>
              <th className="py-2 pr-4" />
            </tr>
          </thead>
          <tbody>
            {items?.map((item) => (
              <tr key={item.id} className="border-b border-neutral-50 last:border-0">
                <td className="py-2 pl-4 pr-4">
                  {/* Plain <img>, not next/image: avoids needing a remote-pattern
                      config for a Supabase project URL that varies per deploy. */}
                  {item.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.image_url}
                      alt=""
                      className="h-10 w-10 rounded-lg object-cover"
                    />
                  )}
                </td>
                <td className="py-2 pr-4 font-semibold text-neutral-800">{item.title}</td>
                <td className="py-2 pr-4">
                  <Badge tone={item.item_type === "book" ? "info" : "neutral"}>
                    {item.item_type}
                  </Badge>
                </td>
                <td className="py-2 pr-4 text-neutral-600">{item.sku}</td>
                <td className="py-2 pr-4">${item.cost}</td>
                <td className="py-2 pr-4">${item.price}</td>
                <td className="py-2 pr-4">{item.stock_on_hand}</td>
                <td className="py-2 pr-4">
                  <form action={receiveStock} className="flex gap-1">
                    <input type="hidden" name="catalog_item_id" value={item.id} />
                    <Input
                      name="quantity"
                      type="number"
                      min={1}
                      required
                      placeholder="Qty"
                      className="w-16 px-2 py-1"
                    />
                    <Button type="submit" size="sm" variant="outline">
                      Receive
                    </Button>
                  </form>
                </td>
                <td className="py-2 pr-4">
                  <Link href={`/admin/catalog/${item.id}/edit`} className="font-semibold text-accent-600 hover:underline">
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
