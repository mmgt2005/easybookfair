// Merges the standardized inventory-request terms template
// (inventory_terms_versions, migration 0075) with a request's real line
// items — a pure function, template only real fields, never invent
// content (same convention as lib/marketingCopy.ts). Usable both
// server-side (the final frozen snapshot stored on the request at send
// time) and client-side (a live preview in the admin form), since it has
// no server dependency.

export type InventoryTermsLineItem = {
  bookTitle: string;
  quantity: number;
  wholesaleCostPerUnit: number;
  wholesaleAmountTotal: number;
};

export type InventoryTermsVars = {
  lineItems: InventoryTermsLineItem[];
  authorName: string;
  requestDate: string; // already formatted, e.g. "October 3, 2026"
};

function renderLineItemsBlock(items: InventoryTermsLineItem[]): string {
  return items
    .map(
      (i) =>
        `- ${i.quantity} x "${i.bookTitle}" @ $${i.wholesaleCostPerUnit.toFixed(2)}/unit = $${i.wholesaleAmountTotal.toFixed(2)}`,
    )
    .join("\n");
}

export function renderInventoryTermsTemplate(template: string, vars: InventoryTermsVars): string {
  const totalWholesaleAmount = vars.lineItems.reduce((sum, i) => sum + i.wholesaleAmountTotal, 0);
  return template
    .replaceAll("{{line_items}}", renderLineItemsBlock(vars.lineItems))
    .replaceAll("{{total_wholesale_amount}}", `$${totalWholesaleAmount.toFixed(2)}`)
    .replaceAll("{{author_name}}", vars.authorName)
    .replaceAll("{{request_date}}", vars.requestDate);
}
