import { bulkUploadCatalogItems } from "../actions";

export default function BulkUploadPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">Bulk upload catalog items</h1>
      <p className="max-w-lg text-sm text-neutral-600">
        CSV with a header row. Required columns: <code>title</code>,{" "}
        <code>cost</code>, <code>price</code>. Optional: <code>item_type</code>{" "}
        (book/merchandise), <code>sku</code>, <code>isbn</code>,{" "}
        <code>image_url</code>, <code>category</code>, <code>tags</code>{" "}
        (semicolon-separated, not comma — this is a CSV), <code>description</code>,{" "}
        <code>weight_oz</code>, <code>lead_time_days</code>,{" "}
        <code>stock_on_hand</code>.
      </p>
      <form action={bulkUploadCatalogItems} className="flex max-w-sm flex-col gap-2">
        <input name="file" type="file" accept=".csv" required />
        <button type="submit" className="rounded bg-neutral-900 px-3 py-1.5 text-white">
          Upload
        </button>
      </form>
    </div>
  );
}
