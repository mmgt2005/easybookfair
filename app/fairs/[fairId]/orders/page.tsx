import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button, Card, Input } from "@/components/ui";

type OrderSummary = {
  id: string;
  status: string;
  fulfillment_status: string | null;
  buyer_name: string | null;
  line_items: { title: string; quantity: number; price_charged: number }[];
  created_at: string;
};

// Order recovery: no buyer login and no guaranteed confirmation email means
// a lost order code has no other way back — search by the email given at
// checkout. See migration 0027 for the trust tradeoff this accepts (anyone
// who knows the email can see the order, not just the buyer — fine for
// what's exposed, low-stakes order contents/pickup status).
export default async function FindOrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ fairId: string }>;
  searchParams: Promise<{ email?: string }>;
}) {
  const { fairId } = await params;
  const { email } = await searchParams;
  const supabase = await createClient();

  const { data } = email
    ? await supabase.rpc("get_checkout_sessions_by_email", {
        p_fair_id: fairId,
        p_email: email,
      })
    : { data: null };

  const orders = (data ?? []) as OrderSummary[];

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 p-6">
      <h1 className="font-heading text-2xl font-bold text-neutral-900">Find my order 🔍</h1>
      <Card>
        <form className="flex gap-2">
          <Input
            type="email"
            name="email"
            defaultValue={email ?? ""}
            placeholder="Email used at checkout"
            required
            className="flex-1"
          />
          <Button type="submit">Search</Button>
        </form>
      </Card>

      {email && (
        <Card>
          {orders.length === 0 ? (
            <p className="text-sm text-neutral-600">No orders found for that email at this fair.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {orders.map((order) => {
                const total = order.line_items.reduce(
                  (sum, l) => sum + l.quantity * l.price_charged,
                  0,
                );
                return (
                  <li key={order.id} className="rounded-lg bg-neutral-50 p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold">
                        {order.id.slice(0, 8).toUpperCase()}
                      </span>
                      <span className="text-xs text-neutral-500">
                        {order.status === "completed"
                          ? order.fulfillment_status === "picked_up"
                            ? "Picked up"
                            : "Awaiting pickup"
                          : "Processing"}
                      </span>
                    </div>
                    <ul className="mt-1 list-disc pl-4 text-neutral-600">
                      {order.line_items.map((l, i) => (
                        <li key={i}>
                          {l.quantity}× {l.title}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-1 flex items-center justify-between">
                      <span className="font-semibold text-neutral-900">
                        ${total.toFixed(2)}
                      </span>
                      <Link
                        href={`/fairs/${fairId}/order/${order.id}`}
                        className="font-semibold text-accent-600 hover:underline"
                      >
                        View →
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
