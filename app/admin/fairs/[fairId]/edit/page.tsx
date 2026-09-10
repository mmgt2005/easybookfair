import { createClient } from "@/lib/supabase/server";
import { updateFair } from "../../actions";

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
      <h1 className="text-lg font-semibold">Edit fair</h1>
      <p className="text-sm text-neutral-600">
        {(fair.organizations as unknown as { name: string } | null)?.name}
      </p>
      <form action={updateFairForFair} className="flex max-w-sm flex-col gap-2">
        <input
          name="name"
          required
          defaultValue={fair.name}
          placeholder="Fair name"
          className="rounded border border-neutral-300 px-2 py-1"
        />
        <label className="text-xs text-neutral-600">
          Start date
          <input
            name="start_date"
            type="date"
            required
            defaultValue={fair.start_date}
            className="mt-1 block w-full rounded border border-neutral-300 px-2 py-1"
          />
        </label>
        <label className="text-xs text-neutral-600">
          End date
          <input
            name="end_date"
            type="date"
            required
            defaultValue={fair.end_date}
            className="mt-1 block w-full rounded border border-neutral-300 px-2 py-1"
          />
        </label>
        <label className="text-xs text-neutral-600">
          Return deadline
          <input
            name="return_deadline"
            type="date"
            required
            defaultValue={fair.return_deadline}
            className="mt-1 block w-full rounded border border-neutral-300 px-2 py-1"
          />
        </label>
        <label className="text-xs text-neutral-600">
          Status
          <select
            name="status"
            defaultValue={fair.status}
            className="mt-1 block w-full rounded border border-neutral-300 px-2 py-1"
          >
            <option value="scheduled">Scheduled</option>
            <option value="active">Active</option>
            <option value="return_window">Return window</option>
            <option value="closed">Closed</option>
          </select>
        </label>
        <label className="text-xs text-neutral-600">
          Cash sales assumption % (0–1, blank = platform default)
          <input
            name="cash_sales_assumption_pct"
            type="number"
            step="0.01"
            min={0}
            max={1}
            defaultValue={fair.cash_sales_assumption_pct ?? ""}
            className="mt-1 block w-full rounded border border-neutral-300 px-2 py-1"
          />
        </label>
        <p className="text-xs text-amber-700">
          Status doesn&apos;t transition automatically yet (that&apos;s a later
          phase) — this is a manual override for now.
        </p>
        <button type="submit" className="rounded bg-neutral-900 px-3 py-1.5 text-white">
          Save changes
        </button>
      </form>
    </div>
  );
}
