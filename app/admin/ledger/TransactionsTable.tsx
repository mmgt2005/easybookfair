import type { LedgerTransactionRow } from "@/lib/ledger";

export type TransactionRowWithBalance = LedgerTransactionRow & { runningBalance: number };

// Shared by the on-screen (paginated) and print (full, unpaginated) views
// on the per-account page — same table markup either way, just fed a
// different slice of rows, so the two can never visually drift apart.
export function TransactionsTable({ rows }: { rows: TransactionRowWithBalance[] }) {
  return (
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
        {rows.map((r) => (
          <tr key={r.id} className="border-b border-neutral-50 last:border-0">
            <td className="py-2 pl-4 pr-4 text-neutral-600">
              {new Date(r.postedAt).toLocaleString()}
            </td>
            <td className="py-2 pr-4 text-neutral-600">{r.entryType}</td>
            <td className="py-2 pr-4 text-neutral-800">{r.description ?? ""}</td>
            <td className="py-2 pr-4 text-neutral-600">{r.fairName ?? "—"}</td>
            <td className="py-2 pr-4 text-neutral-600">{r.orgName ?? "—"}</td>
            <td className="py-2 pr-4 text-right">{r.debit > 0 ? `$${r.debit.toFixed(2)}` : ""}</td>
            <td className="py-2 pr-4 text-right">{r.credit > 0 ? `$${r.credit.toFixed(2)}` : ""}</td>
            <td className="py-2 pr-4 text-right font-semibold">${r.runningBalance.toFixed(2)}</td>
          </tr>
        ))}
        {rows.length === 0 && (
          <tr>
            <td colSpan={8} className="py-4 pl-4 text-neutral-500">
              No transactions match the current filters.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
