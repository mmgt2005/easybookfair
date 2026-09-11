import { createClient } from "@/lib/supabase/server";
import { updateFair } from "../../actions";
import { Button, Card, Field, Input, Select } from "@/components/ui";

export default async function EditFairPage({
  params,
}: {
  params: Promise<{ fairId: string }>;
}) {
  const { fairId } = await params;
  const supabase = await createClient();

  const { data: fair, error } = await supabase
    .from("fairs")
    .select(
      "id, name, start_date, end_date, return_deadline, status, cash_sales_assumption_pct, organizations(name)",
    )
    .eq("id", fairId)
    .single();

  if (error || !fair) {
    return <p className="text-sm text-red-600">Fair not found.</p>;
  }

  const updateFairForFair = updateFair.bind(null, fairId);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-2xl font-bold text-neutral-900">Edit fair 🎪</h1>
      <p className="text-sm text-neutral-600">
        {(fair.organizations as unknown as { name: string } | null)?.name}
      </p>
      <Card className="max-w-sm">
        <form action={updateFairForFair} className="flex flex-col gap-3">
          <Input name="name" required defaultValue={fair.name} placeholder="Fair name" />
          <Field label="Start date">
            <Input name="start_date" type="date" required defaultValue={fair.start_date} />
          </Field>
          <Field label="End date">
            <Input name="end_date" type="date" required defaultValue={fair.end_date} />
          </Field>
          <Field label="Return deadline">
            <Input name="return_deadline" type="date" required defaultValue={fair.return_deadline} />
          </Field>
          <Field label="Status">
            <Select name="status" defaultValue={fair.status}>
              <option value="scheduled">Scheduled</option>
              <option value="active">Active</option>
              <option value="return_window">Return window</option>
              <option value="closed">Closed</option>
            </Select>
          </Field>
          <Field label="Cash sales assumption % (0–1, blank = platform default)">
            <Input
              name="cash_sales_assumption_pct"
              type="number"
              step="0.01"
              min={0}
              max={1}
              defaultValue={fair.cash_sales_assumption_pct ?? ""}
            />
          </Field>
          <p className="text-xs text-amber-700">
            Status doesn&apos;t transition automatically yet (that&apos;s a later
            phase) — this is a manual override for now.
          </p>
          <Button type="submit">Save changes</Button>
        </form>
      </Card>
    </div>
  );
}
