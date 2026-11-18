import { createClient } from "@/lib/supabase/server";
import { Card, PrintButton } from "@/components/ui";
import { AutoPrint, EmailReceiptForm } from "./ReceiptActions";

type OrderPublic = {
  id: string;
  status: string;
  fulfillment_status: string | null;
  buyer_name: string | null;
  channel: "online" | "in_person" | "cash" | "wallet";
  line_items: {
    catalog_item_id: string;
    title: string;
    quantity: number;
    price_charged: number;
  }[];
  fair_name: string;
  tax_amount: number;
};

// No buyer login exists, so this page is reachable by the checkout
// session's own id — an unguessable uuid, same access-control shape as a
// Stripe hosted receipt link (see migration 0025's comment on
// get_checkout_session_public). A confirmation email is also sent (see
// lib/email.ts), but that's best-effort (a delivery failure doesn't fail
// the payment) — this page is the reliable record, and /fairs/<id>/orders
// covers the case a buyer loses the link/email both.
export default async function OrderConfirmationPage({
  params,
  searchParams,
}: {
  params: Promise<{ fairId: string; checkoutSessionId: string }>;
  searchParams: Promise<{ print?: string; thermal?: string }>;
}) {
  const { fairId, checkoutSessionId } = await params;
  const { print, thermal } = await searchParams;
  const supabase = await createClient();

  const { data: order } = await supabase
    .rpc("get_checkout_session_public", { p_checkout_session_id: checkoutSessionId })
    .maybeSingle<OrderPublic>();

  if (!order) {
    return <p className="p-6 text-sm text-red-600">Order not found.</p>;
  }

  const subtotal = order.line_items.reduce(
    (sum, line) => sum + line.quantity * line.price_charged,
    0,
  );
  const total = subtotal + order.tax_amount;
  const orderCode = order.id.slice(0, 8).toUpperCase();

  const isOnline = order.channel === "online";

  // Thermal (80mm roll) layout — a narrow, chrome-free variant for staff
  // printing to a driver-installed thermal printer from a computer (the
  // existing full-width Card above prints cropped/scaled on an 80mm roll).
  // Reached via CheckoutClient.tsx's "Print receipt (thermal)" button,
  // which opens this same page with ?print=1&thermal=1.
  if (thermal === "1") {
    return (
      <div className="mx-auto max-w-[320px] p-3 font-mono text-sm text-neutral-900">
        <style>{"@page { size: 80mm auto; margin: 0; }"}</style>
        {print === "1" && <AutoPrint />}
        {order.status === "completed" ? (
          <>
            <h1 className="text-center text-base font-bold">{order.fair_name}</h1>
            <p className="text-center">{isOnline ? "Order confirmed" : "Receipt"}</p>
            <p className="mt-2">Order code: {orderCode}</p>
            <div className="mt-2 flex flex-col gap-1 border-t border-dashed border-neutral-400 pt-2">
              {order.line_items.map((line, i) => (
                <div key={i} className="flex justify-between gap-2">
                  <span>
                    {line.quantity}× {line.title}
                  </span>
                  <span>${(line.quantity * line.price_charged).toFixed(2)}</span>
                </div>
              ))}
            </div>
            {order.tax_amount > 0 && (
              <div className="mt-2 flex flex-col border-t border-dashed border-neutral-400 pt-2">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>${subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Tax</span>
                  <span>${order.tax_amount.toFixed(2)}</span>
                </div>
              </div>
            )}
            <div className="mt-2 flex justify-between border-t border-dashed border-neutral-400 pt-2 text-base font-bold">
              <span>Total</span>
              <span>${total.toFixed(2)}</span>
            </div>
            <div className="mt-4 text-center print:hidden">
              <PrintButton />
            </div>
          </>
        ) : (
          <p className="mt-2">Payment processing — refresh shortly.</p>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 p-6">
      {print === "1" && <AutoPrint />}
      <Card>
        {order.status === "completed" ? (
          <>
            <h1 className="font-heading text-xl font-bold text-neutral-900">
              {isOnline ? "Order confirmed 🎉" : "Receipt"}
            </h1>
            <p className="mt-1 text-sm text-neutral-600">{order.fair_name}</p>
            <p className="mt-3 text-sm text-neutral-700">
              Order code: <span className="font-mono font-bold">{orderCode}</span>
            </p>
            {isOnline && (
              <p className="text-xs text-neutral-500">
                A confirmation email is on its way — save this page or write down your order code
                too, just in case. Pick up is at the fair.
              </p>
            )}
            <ul className="mt-3 flex flex-col gap-1 text-sm text-neutral-700">
              {order.line_items.map((line, i) => (
                <li key={i} className="flex justify-between">
                  <span>
                    {line.quantity}× {line.title}
                  </span>
                  <span>${(line.quantity * line.price_charged).toFixed(2)}</span>
                </li>
              ))}
            </ul>
            {order.tax_amount > 0 && (
              <div className="mt-2 flex flex-col text-sm text-neutral-600">
                <span>Subtotal: ${subtotal.toFixed(2)}</span>
                <span>Sales tax: ${order.tax_amount.toFixed(2)}</span>
              </div>
            )}
            <p className="mt-2 font-semibold text-neutral-900">Total: ${total.toFixed(2)}</p>
            {isOnline && (
              <p className="mt-3 text-sm">
                Status:{" "}
                <span className="font-semibold">
                  {order.fulfillment_status === "picked_up" ? "Picked up" : "Awaiting pickup"}
                </span>
              </p>
            )}
            <div className="mt-4 print:hidden">
              <PrintButton />
            </div>
            <EmailReceiptForm fairId={fairId} checkoutSessionId={checkoutSessionId} />
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
