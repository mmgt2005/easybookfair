import { createClient } from "@/lib/supabase/server";
import { toCsv } from "@/lib/csv";
import { getTrialBalance, getLedgerTransactions, type LedgerFilters } from "@/lib/ledger";
import { getItemizedSales, getSalesTaxSummary } from "@/lib/salesExport";

export const runtime = "nodejs";

const REPORTS = ["trial-balance", "transactions", "sales", "sales-tax"] as const;
type Report = (typeof REPORTS)[number];

// Called by the "Download CSV" links on /admin/ledger as a plain browser
// navigation (an <a href> download, not a page render) — so unlike
// requireAdmin() (which redirects via next/navigation, wrong for a
// fetch()/direct-download caller), an unauthorized request here gets a
// plain 401/403 response, mirroring
// app/api/terminal/connection-token/route.ts's own documented reasoning.
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { data: adminRow } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!adminRow) {
    return new Response("Forbidden", { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const report = params.get("report") as Report | null;
  if (!report || !REPORTS.includes(report)) {
    return new Response(`report must be one of: ${REPORTS.join(", ")}`, { status: 400 });
  }

  const filters: LedgerFilters = {
    start: params.get("start") ?? undefined,
    end: params.get("end") ?? undefined,
    orgId: params.get("org_id") ?? undefined,
    fairId: params.get("fair_id") ?? undefined,
  };

  // Only a bare YYYY-MM-DD shape is ever reflected into the filename
  // (Content-Disposition is an HTTP header — an unvalidated query param
  // written into it is a header-injection risk, e.g. a CRLF smuggled in
  // via "start"). An off-shape value still works as an actual filter
  // (safely parameterized by the Supabase client), it just doesn't appear
  // in the downloaded filename.
  const isIsoDate = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const dateSuffix =
    isIsoDate(filters.start) || isIsoDate(filters.end)
      ? `_${isIsoDate(filters.start) ? filters.start : "start"}_to_${isIsoDate(filters.end) ? filters.end : "now"}`
      : "";

  let csv: string;
  let filename: string;

  if (report === "trial-balance") {
    const rows = await getTrialBalance(supabase, filters);
    csv = toCsv(
      [
        { key: "code", label: "Account code" },
        { key: "name", label: "Account name" },
        { key: "type", label: "Type" },
        { key: "totalDebit", label: "Total debits" },
        { key: "totalCredit", label: "Total credits" },
        { key: "balance", label: "Balance" },
      ],
      rows,
    );
    filename = `trial-balance${dateSuffix}.csv`;
  } else if (report === "transactions") {
    const accountCode = params.get("account_code") ?? undefined;
    const rows = await getLedgerTransactions(supabase, { ...filters, accountCode });
    // Same header-injection guard as dateSuffix above — only an
    // alphanumeric account code is reflected into the filename.
    const safeAccountCode = accountCode && /^[A-Za-z0-9]+$/.test(accountCode) ? accountCode : undefined;
    csv = toCsv(
      [
        { key: "postedAt", label: "Date" },
        { key: "accountCode", label: "Account code" },
        { key: "accountName", label: "Account name" },
        { key: "entryType", label: "Entry type" },
        { key: "description", label: "Description" },
        { key: "fairName", label: "Fair" },
        { key: "orgName", label: "Organization" },
        { key: "debit", label: "Debit" },
        { key: "credit", label: "Credit" },
        { key: "journalEntryId", label: "Journal entry ID" },
        { key: "referenceId", label: "Reference ID" },
      ],
      rows,
    );
    filename = `general-ledger${safeAccountCode ? `_${safeAccountCode}` : ""}${dateSuffix}.csv`;
  } else if (report === "sales") {
    const rows = await getItemizedSales(supabase, filters);
    csv = toCsv(
      [
        { key: "soldAt", label: "Date" },
        { key: "fairName", label: "Fair" },
        { key: "orgName", label: "Organization" },
        { key: "itemTitle", label: "Item" },
        { key: "channel", label: "Channel" },
        { key: "priceCharged", label: "Price charged" },
        { key: "wholesaleCost", label: "Wholesale cost" },
      ],
      rows,
    );
    filename = `itemized-sales${dateSuffix}.csv`;
  } else {
    const rows = await getSalesTaxSummary(supabase, filters);
    csv = toCsv(
      [
        { key: "fairName", label: "Fair" },
        { key: "orgName", label: "Organization" },
        { key: "taxState", label: "Tax state" },
        { key: "combinedRatePct", label: "Combined rate" },
        { key: "salesTaxCollected", label: "Sales tax collected" },
      ],
      rows,
    );
    filename = `sales-tax-summary${dateSuffix}.csv`;
  }

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
