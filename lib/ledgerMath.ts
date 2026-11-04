export type LedgerLine = { account_code: string; debit: number; credit: number };

export type LedgerTotals = {
  payoutDue: number;
  cashWholesaleOwed: number;
  salesTaxCollected: number;
};

// Shared by getPayoutEstimate() (app/admin/fairs/[fairId]/sales/actions.ts,
// one fair's lines) and the admin dashboard (app/admin/page.tsx, one
// bucket of lines per fair) — the exact credit-debit/debit-credit-by-
// account convention this app uses throughout (2000 Org Payable and 2100
// Sales Tax Payable are liabilities, normal credit balance; 1300
// Accounts Receivable — Orgs is an asset, normal debit balance), each
// clamped at 0 before use. Extracted because both call sites had
// independently reimplemented this identical loop — a formula-drift risk
// if one were ever edited without the other.
export function accumulateLedgerTotals(lines: LedgerLine[]): LedgerTotals {
  let payoutDue = 0;
  let cashWholesaleOwed = 0;
  let salesTaxCollected = 0;
  for (const line of lines) {
    if (line.account_code === "2000") {
      payoutDue += line.credit - line.debit;
    } else if (line.account_code === "1300") {
      cashWholesaleOwed += line.debit - line.credit;
    } else if (line.account_code === "2100") {
      salesTaxCollected += line.credit - line.debit;
    }
  }
  return {
    payoutDue: Math.max(payoutDue, 0),
    cashWholesaleOwed: Math.max(cashWholesaleOwed, 0),
    salesTaxCollected: Math.max(salesTaxCollected, 0),
  };
}
