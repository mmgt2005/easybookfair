import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getTrialBalance, type LedgerFilters } from "@/lib/ledger";
import { Card, PageHeader, PrintButton } from "@/components/ui";
import { FilterBar } from "./FilterBar";

function filtersToQuery(filters: LedgerFilters): string {
  const params = new URLSearchParams();
  if (filters.start) params.set("start", filters.start);
  if (filters.end) params.set("end", filters.end);
  if (filters.orgId) params.set("org_id", filters.orgId);
  if (filters.fairId) params.set("fair_id", filters.fairId);
  return params.toString();
}

// Human-readable stand-in for the filter form, shown only when printing
// (the interactive form itself is print:hidden) — so a printed/saved
// trial balance says what date range and scope it actually covers.
function filterSummary(
  filters: LedgerFilters,
  orgName: string | null,
  fairName: string | null,
): string {
  const dateRange =
    filters.start || filters.end
      ? `${filters.start ?? "the beginning"} through ${filters.end ?? "now"}`
      : "All time";
  const scope = fairName
    ? `Fair: ${fairName}`
    : orgName
      ? `Organization: ${orgName}`
      : "All organizations and fairs";
  return `${dateRange} · ${scope}`;
}

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string; end?: string; org_id?: string; fair_id?: string }>;
}) {
  await requireAdmin();
  const { start, end, org_id: orgId, fair_id: fairId } = await searchParams;
  const filters: LedgerFilters = { start, end, orgId, fairId };
  const supabase = await createClient();

  const [rows, { data: orgs }, { data: fairsData }] = await Promise.all([
    getTrialBalance(supabase, filters),
    supabase.from("organizations").select("id, name").order("name"),
    supabase
      .from("fairs")
      .select("id, name, organizations(name)")
      .order("start_date", { ascending: false }),
  ]);

  const fairs = (fairsData ?? []).map((f) => ({
    id: f.id,
    name: f.name,
    orgName: (f.organizations as unknown as { name: string } | null)?.name ?? "",
  }));

  const query = filtersToQuery(filters);
  const exportHref = (report: string) =>
    `/api/admin/ledger-export?report=${report}${query ? `&${query}` : ""}`;

  const totalDebit = rows.reduce((sum, r) => sum + r.totalDebit, 0);
  const totalCredit = rows.reduce((sum, r) => sum + r.totalCredit, 0);
  // Rounded to the cent before comparing — these are sums of numeric(12,2)
  // values that round-trip through JS floats, so exact === would be
  // vulnerable to a hairline epsilon mismatch that isn't a real
  // out-of-balance ledger.
  const balances = Math.round(totalDebit * 100) === Math.round(totalCredit * 100);

  const orgName = orgs?.find((o) => o.id === orgId)?.name ?? null;
  const fairName = fairs.find((f) => f.id === fairId)?.name ?? null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="General ledger 📒"
        description="Current account balances across every fair and organization. Filter by date range, organization, or fair, then click an account to see its transactions."
      />

      <div className="print:hidden">
        <PrintButton />
      </div>
      <p className="hidden text-sm text-neutral-600 print:block">
        {filterSummary(filters, orgName, fairName)}
      </p>

      <Card className="print:hidden">
        <FilterBar
          action="/admin/ledger"
          start={start}
          end={end}
          orgId={orgId}
          fairId={fairId}
          orgs={orgs ?? []}
          fairs={fairs}
        />
      </Card>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-100 bg-neutral-50 text-left">
              <th className="py-2 pl-4 pr-4">Code</th>
              <th className="py-2 pr-4">Name</th>
              <th className="py-2 pr-4">Type</th>
              <th className="py-2 pr-4 text-right">Total debits</th>
              <th className="py-2 pr-4 text-right">Total credits</th>
              <th className="py-2 pr-4 text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.code} className="border-b border-neutral-50 last:border-0">
                <td className="py-2 pl-4 pr-4">
                  <Link
                    href={`/admin/ledger/${r.code}${query ? `?${query}` : ""}`}
                    className="font-semibold text-accent-600 hover:underline"
                  >
                    {r.code}
                  </Link>
                </td>
                <td className="py-2 pr-4 text-neutral-800">{r.name}</td>
                <td className="py-2 pr-4 capitalize text-neutral-600">{r.type}</td>
                <td className="py-2 pr-4 text-right">${r.totalDebit.toFixed(2)}</td>
                <td className="py-2 pr-4 text-right">${r.totalCredit.toFixed(2)}</td>
                <td className="py-2 pr-4 text-right font-semibold">${r.balance.toFixed(2)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-4 pl-4 text-neutral-500">
                  No accounts found.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-neutral-200 font-semibold">
              <td className="py-2 pl-4 pr-4" colSpan={3}>
                Total {balances ? "— balances ✅" : "— DOES NOT BALANCE ⚠️"}
              </td>
              <td className="py-2 pr-4 text-right">${totalDebit.toFixed(2)}</td>
              <td className="py-2 pr-4 text-right">${totalCredit.toFixed(2)}</td>
              <td className="py-2 pr-4"></td>
            </tr>
          </tfoot>
        </table>
      </Card>

      <Card className="print:hidden">
        <h2 className="mb-3 font-heading font-bold text-neutral-900">Download CSV</h2>
        <p className="mb-3 text-sm text-neutral-600">
          Each download reflects the filters above. Hand these to a bookkeeper or accountant as-is.
        </p>
        <div className="flex flex-wrap gap-4 text-sm">
          <a href={exportHref("trial-balance")} className="font-semibold text-accent-600 hover:underline">
            Trial balance
          </a>
          <a href={exportHref("transactions")} className="font-semibold text-accent-600 hover:underline">
            General ledger (all transactions)
          </a>
          <a href={exportHref("sales")} className="font-semibold text-accent-600 hover:underline">
            Itemized sales
          </a>
          <a href={exportHref("sales-tax")} className="font-semibold text-accent-600 hover:underline">
            Sales tax summary
          </a>
        </div>
      </Card>
    </div>
  );
}
