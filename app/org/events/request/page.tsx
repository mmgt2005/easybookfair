import { requireOrgStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createEventRequest } from "../../actions";
import { FairPicker } from "./FairPicker";
import { Button, Card, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";

export default async function RequestEventPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; fair_id?: string }>;
}) {
  const { orgIds } = await requireOrgStaff();
  const { error: errorMessage, fair_id: fairId } = await searchParams;
  const supabase = await createClient();

  const { data: fairs } = await supabase
    .from("fairs")
    .select("id, org_id, name")
    .in("org_id", orgIds)
    .in("status", ["scheduled", "active"])
    .order("start_date");

  const selectedFair = (fairs ?? []).find((f) => f.id === fairId);

  const { data: allocations } = selectedFair
    ? await supabase
        .from("allocations")
        .select("catalog_item_id, catalog_items(title, item_type)")
        .eq("fair_id", selectedFair.id)
    : { data: null };

  const books = (allocations ?? []).filter(
    (a) => (a.catalog_items as unknown as { item_type: string } | null)?.item_type === "book",
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Request an author reading or book signing 🖋️"
        description="Pick a book from one of your upcoming fairs — a platform admin reviews the request and coordinates the details."
      />

      {errorMessage && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p>
      )}

      <Card className="max-w-lg">
        <form action={createEventRequest} className="flex flex-col gap-3">
          <Field label="Fair">
            <FairPicker fairs={fairs ?? []} selectedFairId={fairId ?? ""} />
          </Field>

          <Field label="Book" hint={selectedFair ? undefined : "Pick a fair first"}>
            <Select name="catalog_item_id" required defaultValue="" disabled={!selectedFair}>
              <option value="" disabled>
                {selectedFair ? "Select book…" : "Pick a fair first"}
              </option>
              {books.map((a) => {
                const item = a.catalog_items as unknown as { title: string } | null;
                return (
                  <option key={a.catalog_item_id} value={a.catalog_item_id}>
                    {item?.title}
                  </option>
                );
              })}
            </Select>
            {selectedFair && books.length === 0 && (
              <p className="text-xs text-neutral-500">
                No books allocated to this fair yet — allocate one first.
              </p>
            )}
          </Field>

          <Field label="Event type">
            <Select name="event_type" required defaultValue="">
              <option value="" disabled>
                Select type…
              </option>
              <option value="author_reading">Author reading</option>
              <option value="book_signing">Book signing</option>
            </Select>
          </Field>

          <Field label="Requested date" hint="Leave blank if you don't have one in mind yet">
            <Input name="requested_date" type="date" />
          </Field>

          <Field label="Notes (optional)">
            <Textarea name="notes" rows={3} placeholder="Anything the admin should know" />
          </Field>

          <Button type="submit">Submit request</Button>
        </form>
      </Card>
    </div>
  );
}
