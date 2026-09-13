import { requireOrgStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { markPickedUp } from "@/app/admin/fairs/[fairId]/pickup/actions";
import { Badge, Button, Card, Input, PageHeader } from "@/components/ui";

type LineItem = { title: string; quantity: number };

// Mirrors app/admin/fairs/[fairId]/pickup/page.tsx — same markPickedUp
// Server Action (requireFairStaff() inside it lets org staff call it for a
// fair their own org owns), only the page-level gate and explicit
// org-ownership check differ.
export default async function OrgPickupPage({
  params,
  searchParams,
}: {
  params: Promise<{ fairId: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { fairId } = await params;
  const { q } = await searchParams;
  const { orgIds } = await requireOrgStaff();
  const supabase = await createClient();

  const { data: fair } = await supabase
    .from("fairs")
    .select("id, name")
    .eq("id", fairId)
    .in("org_id", orgIds)
    .maybeSingle();
  if (!fair) {
    return <p className="text-sm text-red-600">Fair not found.</p>;
  }

  let query = supabase
    .from("checkout_sessions")
    .select("id, buyer_name, buyer_email, fulfillment_status, line_items, created_at")
    .eq("fair_id", fairId)
    .eq("channel", "online")
    .eq("status", "completed")
    .order("created_at", { ascending: false });

  if (q) {
    query = query.or(`buyer_name.ilike.%${q}%,buyer_email.ilike.%${q}%`);
  }

  const { data: orders } = await query;

  const markPickedUpForFair = markPickedUp.bind(null, fairId);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={`${fair.name} — order pickup 🛍️`} />

      <form className="max-w-sm">
        <Input name="q" defaultValue={q ?? ""} placeholder="Search by buyer name or email" />
      </form>

      <Card className="overflow-x-auto p-0">
        <table className="w-full max-w-3xl text-sm">
          <thead>
            <tr className="border-b border-neutral-100 bg-neutral-50 text-left">
              <th className="py-2 pl-4 pr-4">Order</th>
              <th className="py-2 pr-4">Buyer</th>
              <th className="py-2 pr-4">Items</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4" />
            </tr>
          </thead>
          <tbody>
            {(orders ?? []).map((order) => {
              const lineItems = (order.line_items as LineItem[]) ?? [];
              return (
                <tr key={order.id} className="border-b border-neutral-50 last:border-0">
                  <td className="py-2 pl-4 pr-4 font-mono text-xs text-neutral-500">
                    {order.id.slice(0, 8).toUpperCase()}
                  </td>
                  <td className="py-2 pr-4">
                    <div className="font-semibold text-neutral-800">{order.buyer_name}</div>
                    <div className="text-xs text-neutral-500">{order.buyer_email}</div>
                  </td>
                  <td className="py-2 pr-4">
                    <ul className="list-disc pl-4">
                      {lineItems.map((line, i) => (
                        <li key={i}>
                          {line.quantity}× {line.title}
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td className="py-2 pr-4">
                    <Badge tone={order.fulfillment_status === "picked_up" ? "success" : "warning"}>
                      {order.fulfillment_status === "picked_up" ? "Picked up" : "Awaiting pickup"}
                    </Badge>
                  </td>
                  <td className="py-2 pr-4">
                    {order.fulfillment_status === "awaiting_pickup" && (
                      <form action={markPickedUpForFair}>
                        <input type="hidden" name="checkout_session_id" value={order.id} />
                        <Button type="submit" size="sm" variant="outline">
                          Mark picked up
                        </Button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
            {(orders ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="py-4 pl-4 text-neutral-500">
                  No matching orders.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
