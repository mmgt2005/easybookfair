import { createClient } from "@/lib/supabase/server";
import EditCatalogItemForm from "./EditForm";

export default async function EditCatalogItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: item, error } = await supabase
    .from("catalog_items")
    .select(
      "id, item_type, title, sku, isbn, cost, price, image_url, category, tags, description, weight_oz, length_in, width_in, height_in, lead_time_days, stock_on_hand",
    )
    .eq("id", id)
    .single();

  if (error || !item) {
    return <p className="text-sm text-red-600">Catalog item not found.</p>;
  }

  return <EditCatalogItemForm item={item} />;
}
