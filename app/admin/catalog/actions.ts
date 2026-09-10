"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function parseTags(raw: string): string[] {
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

export async function createCatalogItem(formData: FormData) {
  const supabase = await createClient();

  const title = String(formData.get("title") ?? "").trim();
  const cost = Number(formData.get("cost"));
  const price = Number(formData.get("price"));

  if (!title || !Number.isFinite(cost) || !Number.isFinite(price)) {
    throw new Error("Title, cost, and price are required");
  }

  let imageUrl: string | null = null;
  const imageFile = formData.get("image") as File | null;
  if (imageFile && imageFile.size > 0) {
    const extension = imageFile.name.split(".").pop() || "jpg";
    const path = `${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("catalog-images")
      .upload(path, imageFile, { contentType: imageFile.type });
    if (uploadError) {
      throw new Error(`Image upload failed: ${uploadError.message}`);
    }
    imageUrl = supabase.storage.from("catalog-images").getPublicUrl(path).data.publicUrl;
  }

  const { error } = await supabase.from("catalog_items").insert({
    item_type: String(formData.get("item_type") ?? "book"),
    title,
    sku: String(formData.get("sku") ?? "").trim() || null,
    isbn: String(formData.get("isbn") ?? "").trim() || null,
    cost,
    price,
    image_url: imageUrl,
    category: String(formData.get("category") ?? "").trim() || null,
    tags: parseTags(String(formData.get("tags") ?? "")),
    description: String(formData.get("description") ?? "").trim() || null,
    weight_oz: formData.get("weight_oz") ? Number(formData.get("weight_oz")) : null,
    lead_time_days: Number(formData.get("lead_time_days") ?? 0),
    stock_on_hand: Number(formData.get("stock_on_hand") ?? 0),
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/catalog");
  redirect("/admin/catalog");
}

// Bulk upload expects a CSV with a header row matching (a subset of) these
// columns: item_type,title,sku,isbn,cost,price,image_url,category,tags,
// description,weight_oz,lead_time_days,stock_on_hand. tags is a
// semicolon-separated list within its cell so it doesn't collide with the
// CSV's own comma delimiter.
export async function bulkUploadCatalogItems(formData: FormData) {
  const supabase = await createClient();

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) {
    throw new Error("Choose a CSV file first");
  }

  const text = await file.text();
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) {
    throw new Error("CSV needs a header row plus at least one data row");
  }

  const headers = lines[0].split(",").map((h) => h.trim());
  const rows = lines.slice(1).map((line) => {
    const cells = line.split(",");
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (cells[i] ?? "").trim();
    });
    return row;
  });

  const catalogRows = rows.map((row) => ({
    item_type: row.item_type || "book",
    title: row.title,
    sku: row.sku || null,
    isbn: row.isbn || null,
    cost: Number(row.cost),
    price: Number(row.price),
    image_url: row.image_url || null,
    category: row.category || null,
    tags: row.tags ? row.tags.split(";").map((t) => t.trim()).filter(Boolean) : [],
    description: row.description || null,
    weight_oz: row.weight_oz ? Number(row.weight_oz) : null,
    lead_time_days: row.lead_time_days ? Number(row.lead_time_days) : 0,
    stock_on_hand: row.stock_on_hand ? Number(row.stock_on_hand) : 0,
  }));

  const invalid = catalogRows.find(
    (r) => !r.title || !Number.isFinite(r.cost) || !Number.isFinite(r.price),
  );
  if (invalid) {
    throw new Error(`Row missing/invalid title, cost, or price: ${JSON.stringify(invalid)}`);
  }

  const { error } = await supabase.from("catalog_items").insert(catalogRows);
  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/catalog");
  redirect("/admin/catalog");
}
