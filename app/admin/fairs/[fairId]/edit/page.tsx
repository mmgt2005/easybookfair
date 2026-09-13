import { createClient } from "@/lib/supabase/server";
import {
  updateFair,
  createTerminalLocation,
  registerTerminalReader,
  closeFair,
  sendSettlementPayout,
  createSettlementPaymentLink,
} from "../../actions";
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
      "id, name, start_date, end_date, return_deadline, status, cash_sales_assumption_pct, stripe_terminal_location_id, allow_online, allow_wallet, allow_in_person, allow_cash, equipment_rental_fee, organizations(name, is_school, stripe_connect_account_id, stripe_payouts_enabled)",
    )
    .eq("id", fairId)
    .single();

  if (error || !fair) {
    return <p className="text-sm text-red-600">Fair not found.</p>;
  }

  const org = fair.organizations as unknown as {
    name: string;
    is_school: boolean;
    stripe_connect_account_id: string | null;
    stripe_payouts_enabled: boolean;
  } | null;

  const { data: settlement } = await supabase
    .from("settlements")
    .select(
      "payout_due, cash_wholesale_owed, missing_inventory_cost, equipment_rental_fee, total_owed_by_org, net_payout, closed_at, stripe_transfer_id, stripe_payment_link_id",
    )
    .eq("fair_id", fairId)
    .maybeSingle();

  const paymentLinkUrl = settlement?.stripe_payment_link_id
    ? (await getStripe().paymentLinks.retrieve(settlement.stripe_payment_link_id)).url
    : null;

  const updateFairForFair = updateFair.bind(null, fairId);
  const createTerminalLocationForFair = createTerminalLocation.bind(null, fairId);
  const registerTerminalReaderForFair = registerTerminalReader.bind(null, fairId);
  const closeFairForFair = closeFair.bind(null, fairId);
  const sendSettlementPayoutForFair = sendSettlementPayout.bind(null, fairId);
  const createSettlementPaymentLinkForFair = createSettlementPaymentLink.bind(null, fairId);

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
      <p className="text-sm text-neutral-600">{org?.name}</p>

      <Card className="max-w-sm">
        <h2 className="font-heading font-bold text-neutral-900">Public links 🔗</h2>
        <p className="mb-2 text-xs text-neutral-500">
          The same links this org sees on their own dashboard — share these with buyers, or hand
          them to the org directly.
        </p>
        <div className="flex flex-col gap-1 text-sm">
          {fair.allow_online ? (
            <a
              href={`/fairs/${fair.id}`}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-accent-600 hover:underline"
            >
              Storefront: /fairs/{fair.id} →
            </a>
          ) : (
            <span className="text-xs text-neutral-400">Online storefront is turned off.</span>
          )}
          {fair.allow_wallet && org?.is_school ? (
            <a
              href={`/fairs/${fair.id}/wallet`}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-accent-600 hover:underline"
            >
              Student wallet: /fairs/{fair.id}/wallet →
            </a>
          ) : (
            <span className="text-xs text-neutral-400">
              Student wallets are turned off{!org?.is_school ? " (not a school)" : ""}.
            </span>
          )}
        </div>
      </Card>

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
          <div className="flex flex-col gap-2 rounded-lg bg-neutral-50 p-3">
            <p className="text-xs font-semibold text-neutral-600">
              Payment options — set when the org requested this fair, adjustable here after.
            </p>
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input type="checkbox" name="allow_in_person" defaultChecked={fair.allow_in_person} />
              In-person card reader
            </label>
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input type="checkbox" name="allow_online" defaultChecked={fair.allow_online} />
              Online storefront
            </label>
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input type="checkbox" name="allow_wallet" defaultChecked={fair.allow_wallet} />
              Student wallets
            </label>
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input type="checkbox" name="allow_cash" defaultChecked={fair.allow_cash} />
              Cash (no recording UI yet — this flag isn&apos;t enforced anywhere)
            </label>
            {fair.allow_in_person && (
              <Field label="Equipment rental fee ($) — deducted from payout at fair close">
                <Input
                  name="equipment_rental_fee"
                  type="number"
                  step="0.01"
                  min={0}
                  defaultValue={fair.equipment_rental_fee}
                  className="w-28"
                />
              </Field>
            )}
          </div>
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

      <Card className="max-w-sm">
        <h2 className="font-heading font-bold text-neutral-900">Settlement 💰</h2>
        {settlement ? (
          <div className="mt-2 flex flex-col gap-1 text-sm text-neutral-700">
            <p>Payout due (card/online margin): ${settlement.payout_due.toFixed(2)}</p>
            <p>Cash wholesale owed: ${settlement.cash_wholesale_owed.toFixed(2)}</p>
            {settlement.missing_inventory_cost > 0 && (
              <p>Missing inventory: ${settlement.missing_inventory_cost.toFixed(2)}</p>
            )}
            {settlement.equipment_rental_fee > 0 && (
              <p>Equipment rental fee: ${settlement.equipment_rental_fee.toFixed(2)}</p>
            )}
            <p className="mt-1 font-semibold text-neutral-900">
              {settlement.net_payout >= 0
                ? `Net payout to org: $${settlement.net_payout.toFixed(2)}`
                : `Org owes platform: $${Math.abs(settlement.net_payout).toFixed(2)}`}
            </p>
            <p className="text-xs text-neutral-500">
              Closed {new Date(settlement.closed_at).toLocaleString()}
            </p>

            <div className="mt-2 border-t border-neutral-100 pt-2">
              {settlement.net_payout > 0 &&
                (settlement.stripe_transfer_id ? (
                  <p className="text-sm text-green-700">
                    ✅ Payout sent — Stripe transfer <code>{settlement.stripe_transfer_id}</code>
                  </p>
                ) : (
                  <div className="flex flex-col gap-1">
                    {!org?.stripe_connect_account_id ? (
                      <p className="text-xs text-amber-700">
                        This org hasn&apos;t started Stripe Connect onboarding yet — set that up
                        from their organization page before sending a payout.
                      </p>
                    ) : !org.stripe_payouts_enabled ? (
                      <p className="text-xs text-amber-700">
                        This org&apos;s Stripe payouts aren&apos;t enabled yet — finish their
                        Connect onboarding first.
                      </p>
                    ) : null}
                    <form action={sendSettlementPayoutForFair}>
                      <Button
                        type="submit"
                        size="sm"
                        disabled={!org?.stripe_connect_account_id || !org.stripe_payouts_enabled}
                      >
                        Send ${settlement.net_payout.toFixed(2)} payout via Stripe
                      </Button>
                    </form>
                  </div>
                ))}

              {settlement.net_payout < 0 &&
                (paymentLinkUrl ? (
                  <p className="text-sm text-neutral-700">
                    💳 Payment link sent —{" "}
                    <a
                      href={paymentLinkUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-accent-600 hover:underline"
                    >
                      {paymentLinkUrl}
                    </a>
                  </p>
                ) : (
                  <form action={createSettlementPaymentLinkForFair}>
                    <Button type="submit" size="sm" variant="outline">
                      Create ${Math.abs(settlement.net_payout).toFixed(2)} payment link
                    </Button>
                  </form>
                ))}
            </div>
          </div>
        ) : (
          <div className="mt-2 flex flex-col gap-2">
            <p className="text-xs text-neutral-500">
              Computes the payout (or amount owed) from every sale recorded against this fair —
              netting the equipment rental fee above — and locks it. Missing-inventory cost isn&apos;t
              computed yet (no returns-recording feature exists), so it&apos;s always $0 for now.
              Irreversible.
            </p>
            <form action={closeFairForFair}>
              <Button type="submit" variant="outline" size="sm">
                Close this fair
              </Button>
            </form>
          </div>
        )}
      </Card>
    </div>
  );
}
