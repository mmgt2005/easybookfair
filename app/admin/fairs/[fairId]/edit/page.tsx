import { createClient } from "@/lib/supabase/server";
import { updateFair, createTerminalLocation, registerTerminalReader } from "../../actions";
import { getStripe } from "@/lib/stripe";
import { Badge, Button, Card, Field, Input, Select } from "@/components/ui";

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
      "id, name, start_date, end_date, return_deadline, status, cash_sales_assumption_pct, stripe_terminal_location_id, organizations(name)",
    )
    .eq("id", fairId)
    .single();

  if (error || !fair) {
    return <p className="text-sm text-red-600">Fair not found.</p>;
  }

  const updateFairForFair = updateFair.bind(null, fairId);
  const createTerminalLocationForFair = createTerminalLocation.bind(null, fairId);
  const registerTerminalReaderForFair = registerTerminalReader.bind(null, fairId);

  const readers = fair.stripe_terminal_location_id
    ? (
        await getStripe().terminal.readers.list({
          location: fair.stripe_terminal_location_id,
        })
      ).data
    : [];

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

      <Card className="max-w-sm">
        <h2 className="font-heading font-bold text-neutral-900">Terminal setup 💳</h2>
        <p className="mb-3 text-xs text-neutral-500">
          For in-person card payments via a physical reader — internet-connected
          readers only (BBPOS WisePOS E, Stripe Reader S700), not Bluetooth.
        </p>
        {!fair.stripe_terminal_location_id ? (
          <form action={createTerminalLocationForFair} className="flex flex-col gap-3">
            <Input name="display_name" required placeholder="Location name (e.g. venue name)" />
            <Input name="line1" required placeholder="Street address" />
            <div className="flex gap-2">
              <Input name="city" required placeholder="City" className="flex-1" />
              <Input name="state" required placeholder="State" className="w-20" />
            </div>
            <div className="flex gap-2">
              <Input name="postal_code" required placeholder="ZIP" className="flex-1" />
              <Input name="country" defaultValue="US" className="w-20" />
            </div>
            <Button type="submit" size="sm">
              Create Terminal location
            </Button>
          </form>
        ) : (
          <div className="flex flex-col gap-3">
            <ul className="flex flex-col gap-2 text-sm">
              {readers.length === 0 && (
                <li className="text-neutral-600">No readers registered yet.</li>
              )}
              {readers.map((reader) => (
                <li
                  key={reader.id}
                  className="flex items-center justify-between rounded-lg bg-neutral-50 p-2"
                >
                  <span className="text-neutral-800">{reader.label || reader.id}</span>
                  <Badge tone={reader.status === "online" ? "success" : "neutral"}>
                    {reader.status}
                  </Badge>
                </li>
              ))}
            </ul>
            <form action={registerTerminalReaderForFair} className="flex flex-col gap-2">
              <Input name="label" placeholder="Reader label (optional, e.g. Front table)" />
              <Input
                name="registration_code"
                required
                placeholder="Registration code (shown on reader screen)"
              />
              <Button type="submit" size="sm" variant="outline">
                Register reader
              </Button>
            </form>
          </div>
        )}
      </Card>
    </div>
  );
}
