import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getLedgerTransactions, type LedgerFilters } from "@/lib/ledger";
import { Card, PageHeader, PrintButton } from "@/components/ui";
import { FilterBar } from "../FilterBar";
import { TransactionsTable } from "../TransactionsTable";

const PAGE_SIZE = 100;

// Human-readable stand-in for the filter form, shown only when printing
// (the interactive form itself is print:hidden) — so a printed/saved
// page says what date range and scope it actually covers.
function filterSummary(
  filters: { start?: string; end?: string },
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

export default async function LedgerAccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ accountCode: string }>;
  searchParams: Promise<{
    start?: string;
    end?: string;
    org_id?: string;
    fair_id?: string;
    page?: string;
  }>;
}) {
  await requireAdmin();
  const { accountCode } = await params;
  const {
    start,
    end,
    org_id: orgId,
    fair_id: fairId,
    page: pageParam,
  } = await searchParams;
  const filters: LedgerFilters = { start, end, orgId, fairId };
  const supabase = await createClient();

  const [{ data: account }, allRows, { data: orgs }, { data: fairsData }] = await Promise.all([
    supabase.from("accounts").select("code, name, type").eq("code", accountCode).maybeSingle(),
    getLedgerTransactions(supabase, { ...filters, accountCode }),
    supabase.from("organizations").select("id, name").order("name"),
    supabase
      .from("fairs")
      .select("id, name, organizations(name)")
      .order("start_date", { ascending: false }),
  ]);

  if (!account) {
    return <p className="text-sm text-red-600">Account not found.</p>;
  }

  const fairs = (fairsData ?? []).map((f) => ({
    id: f.id,
    name: f.name,
    orgName: (f.organizations as unknown as { name: string } | null)?.name ?? "",
  }));

  // getLedgerTransactions() returns ascending (chronological) order — a
  // running balance only makes sense computed in that order, so it's
  // calculated here before reversing for the on-screen most-recent-first
  // display. The print view below uses this chronological order directly
  // (matching the CSV export's own "report-reading order" convention),
  // not the reversed on-screen order.
  let running = 0;
  const isDebitNormal = account.type === "asset" || account.type === "expense";
  const chronological = allRows.map((r) => {
    running += isDebitNormal ? r.debit - r.credit : r.credit - r.debit;
    return { ...r, runningBalance: running };
  });
  const displayRows = [...chronological].reverse();

  const page = Math.max(Number(pageParam ?? "1") || 1, 1);
  const offset = (page - 1) * PAGE_SIZE;
  const pageRows = displayRows.slice(offset, offset + PAGE_SIZE);
  const totalPages = Math.max(Math.ceil(displayRows.length / PAGE_SIZE), 1);

  const queryParams = new URLSearchParams();
  if (start) queryParams.set("start", start);
  if (end) queryParams.set("end", end);
  if (orgId) queryParams.set("org_id", orgId);
  if (fairId) queryParams.set("fair_id", fairId);
  const queryString = queryParams.toString();
  const pageHref = (p: number) =>
    `/admin/ledger/${accountCode}?${queryString ? `${queryString}&` : ""}page=${p}`;
  const exportHref = `/api/admin/ledger-export?report=transactions&account_code=${accountCode}${
    queryString ? `&${queryString}` : ""
  }`;

  const orgName = orgs?.find((o) => o.id === orgId)?.name ?? null;
  const fairName = fairs.find((f) => f.id === fairId)?.name ?? null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${account.code} — ${account.name}`}
        description={`${displayRows.length} transaction${
          displayRows.length === 1 ? "" : "s"
        } matching the current filters.`}
        backHref={`/admin/ledger${queryString ? `?${queryString}` : ""}`}
        backLabel="Back to general ledger"
      />

      <div className="print:hidden">
        <PrintButton />
      </div>
      <p className="hidden text-sm text-neutral-600 print:block">
        {filterSummary(filters, orgName, fairName)}
      </p>

      <Card className="print:hidden">
        <FilterBar
          action={`/admin/ledger/${accountCode}`}
          start={start}
          end={end}
          orgId={orgId}
          fairId={fairId}
          orgs={orgs ?? []}
          fairs={fairs}
        />
      </Card>

      {/* On-screen: paginated, most-recent-first. */}
      <div className="print:hidden">
        <Card className="overflow-x-auto p-0">
          <TransactionsTable rows={pageRows} />
        </Card>

        {totalPages > 1 && (
          <div className="mt-3 flex items-center gap-3 text-sm">
            {page > 1 && (
              <Link href={pageHref(page - 1)} className="font-semibold text-accent-600 hover:underline">
                ← Newer
              </Link>
            )}
            <span className="text-neutral-500">
              Page {page} of {totalPages}
            </span>
            {page < totalPages && (
              <Link href={pageHref(page + 1)} className="font-semibold text-accent-600 hover:underline">
                Older →
              </Link>
            )}
          </div>
        )}

        <a
          href={exportHref}
          className="mt-3 inline-block text-sm font-semibold text-accent-600 hover:underline"
        >
          Download this account&apos;s transactions (CSV)
        </a>
      </div>

      {/* Print only: every matching transaction, chronological — not just
          whatever page happens to be open on screen. */}
      <div className="hidden print:block">
        <Card className="overflow-x-auto p-0">
          <TransactionsTable rows={chronological} />
        </Card>
      </div>
    </div>
  );
}
