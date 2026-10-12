import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getLedgerTransactions, type LedgerFilters } from "@/lib/ledger";
import { Card, PageHeader } from "@/components/ui";
import { FilterBar } from "../FilterBar";

const PAGE_SIZE = 100;

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
  // display.
  let running = 0;
  const isDebitNormal = account.type === "asset" || account.type === "expense";
  const withRunningBalance = allRows.map((r) => {
    running += isDebitNormal ? r.debit - r.credit : r.credit - r.debit;
    return { ...r, runningBalance: running };
  });
  const displayRows = [...withRunningBalance].reverse();

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

      <Card>
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

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-100 bg-neutral-50 text-left">
              <th className="py-2 pl-4 pr-4">Date</th>
              <th className="py-2 pr-4">Entry type</th>
              <th className="py-2 pr-4">Description</th>
              <th className="py-2 pr-4">Fair</th>
              <th className="py-2 pr-4">Organization</th>
              <th className="py-2 pr-4 text-right">Debit</th>
              <th className="py-2 pr-4 text-right">Credit</th>
              <th className="py-2 pr-4 text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r) => (
              <tr key={r.id} className="border-b border-neutral-50 last:border-0">
                <td className="py-2 pl-4 pr-4 text-neutral-600">
                  {new Date(r.postedAt).toLocaleString()}
                </td>
                <td className="py-2 pr-4 text-neutral-600">{r.entryType}</td>
                <td className="py-2 pr-4 text-neutral-800">{r.description ?? ""}</td>
                <td className="py-2 pr-4 text-neutral-600">{r.fairName ?? "—"}</td>
                <td className="py-2 pr-4 text-neutral-600">{r.orgName ?? "—"}</td>
                <td className="py-2 pr-4 text-right">{r.debit > 0 ? `$${r.debit.toFixed(2)}` : ""}</td>
                <td className="py-2 pr-4 text-right">
                  {r.credit > 0 ? `$${r.credit.toFixed(2)}` : ""}
                </td>
                <td className="py-2 pr-4 text-right font-semibold">
                  ${r.runningBalance.toFixed(2)}
                </td>
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={8} className="py-4 pl-4 text-neutral-500">
                  No transactions match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center gap-3 text-sm">
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

      <a href={exportHref} className="text-sm font-semibold text-accent-600 hover:underline">
        Download this account&apos;s transactions (CSV)
      </a>
    </div>
  );
}
