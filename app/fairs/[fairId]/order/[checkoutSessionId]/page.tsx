import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";

type OrderPublic = {
  id: string;
  status: string;
  fulfillment_status: string | null;
  buyer_name: string | null;
  line_items: { catalog_item_id: string; quantity: number; price_charged: number }[];
  fair_name: string;
};

// No buyer login exists, so this page is reachable by the checkout
// session's own id — an unguessable uuid, same access-control shape as a
// Stripe hosted receipt link (see migration 0025's comment on
// get_checkout_session_public). There's no email confirmation sent (no
// transactional email service is configured) — this page, saved or
// screenshotted, is the buyer's only record of the order for now.
export default async function OrderConfirmationPage({
  params,
}: {
  params: Promise<{ fairId: string; checkoutSessionId: string }>;
}) {
  const { fairId, checkoutSessionId } = await params;
  const supabase = await createClient();

  const { data: order } = await supabase
    .rpc("get_checkout_session_public", { p_checkout_session_id: checkoutSessionId })
    .maybeSingle<OrderPublic>();

  if (!order) {
    return <p className="p-6 text-sm text-red-600">Order not found.</p>;
  }

  const total = order.line_items.reduce(
    (sum, line) => sum + line.quantity * line.price_charged,
    0,
  );
  const orderCode = order.id.slice(0, 8).toUpperCase();

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 p-6">
      <Card>
        {order.status === "completed" ? (
          <>
            <h1 className="font-heading text-xl font-bold text-neutral-900">
              Order confirmed 🎉
            </h1>
            <p className="mt-1 text-sm text-neutral-600">{order.fair_name}</p>
            <p className="mt-3 text-sm text-neutral-700">
              Order code: <span className="font-mono font-bold">{orderCode}</span>
            </p>
            <p className="text-xs text-neutral-500">
              Save this page or write down your order code — pick up is at the fair, and no
              confirmation email is sent.
            </p>
            <ul className="mt-3 flex flex-col gap-1 text-sm text-neutral-700">
              {order.line_items.map((line, i) => (
                <li key={i} className="flex justify-between">
                  <span>{line.quantity}× item</span>
                  <span>${(line.quantity * line.price_charged).toFixed(2)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 font-semibold text-neutral-900">Total: ${total.toFixed(2)}</p>
            <p className="mt-3 text-sm">
              Status:{" "}
              <span className="font-semibold">
                {order.fulfillment_status === "picked_up" ? "Picked up" : "Awaiting pickup"}
              </span>
            </p>
          </>
        ) : (
          <>
            <h1 className="font-heading text-xl font-bold text-neutral-900">
              Payment processing…
            </h1>
            <p className="mt-1 text-sm text-neutral-600">
              Refresh in a moment — this confirms once Stripe finishes processing your payment.
            </p>
          </>
        )}
      </Card>
    </div>
  );
}
