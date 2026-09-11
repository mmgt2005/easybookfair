import { bulkUploadCatalogItems } from "../actions";
import { Button, Card, PageHeader } from "@/components/ui";

export default function BulkUploadPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Bulk upload catalog items 📦"
        description={
          <>
            CSV with a header row. Required columns: <code>title</code>,{" "}
            <code>cost</code>, <code>price</code>. Optional: <code>item_type</code>{" "}
            (book/merchandise), <code>sku</code>, <code>isbn</code>,{" "}
            <code>image_url</code>, <code>category</code>, <code>tags</code>{" "}
            (semicolon-separated, not comma — this is a CSV), <code>description</code>,{" "}
            <code>weight_oz</code>, <code>length_in</code>, <code>width_in</code>,{" "}
            <code>height_in</code> (weight/dimensions drive the packing suggestion),{" "}
            <code>lead_time_days</code>, <code>stock_on_hand</code>.
          </>
        }
      />
      <Card className="max-w-sm">
        <form action={bulkUploadCatalogItems} className="flex flex-col gap-3">
          <input name="file" type="file" accept=".csv" required className="text-sm" />
          <Button type="submit">Upload</Button>
        </form>
      </Card>
    </div>
  );
}
