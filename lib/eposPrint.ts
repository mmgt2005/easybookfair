// Builds and sends an Epson ePOS-Print XML print job directly to a
// receipt printer's own built-in web server over the local network — no
// driver or app needed, which is what makes printing from a tablet or
// phone possible at all (unlike the browser's OS print dialog, which most
// thermal printers aren't certified for via AirPrint/Mopria). Schema:
// https://www.epson-biz.com/modules/ref_epos_print_xml/
//
// printReceiptToEpson() must be called from the browser, never from a
// Server Action — a Vercel serverless function has no network route to a
// printer on the store's local WiFi; only the device actually at the
// checkout table does.

export type ThermalReceiptLineItem = {
  title: string;
  quantity: number;
  price_charged: number;
};

export type ThermalReceiptData = {
  fairName: string;
  orderCode: string;
  lineItems: ThermalReceiptLineItem[];
  taxAmount: number;
};

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// 42 characters is the standard column width for an 80mm roll at the
// printer's default font — right-aligning the amount within it is what
// makes the two columns line up on a monospace thermal printer.
const COLUMNS = 42;
function receiptLine(label: string, amount: string): string {
  const space = Math.max(1, COLUMNS - label.length - amount.length);
  return `${label}${" ".repeat(space)}${amount}`;
}

export function buildEposPrintXml(data: ThermalReceiptData): string {
  const rows: string[] = [];
  rows.push(`<text align="center" width="2" height="2">${escapeXml(data.fairName)}&#10;</text>`);
  rows.push(`<text align="center">Receipt&#10;</text>`);
  rows.push(`<text>Order code: ${escapeXml(data.orderCode)}&#10;</text>`);
  rows.push(`<text>${"-".repeat(COLUMNS)}&#10;</text>`);

  let subtotal = 0;
  for (const line of data.lineItems) {
    subtotal += line.quantity * line.price_charged;
    const amount = `$${(line.quantity * line.price_charged).toFixed(2)}`;
    const label = `${line.quantity}x ${line.title}`;
    rows.push(`<text>${escapeXml(receiptLine(label, amount))}&#10;</text>`);
  }

  rows.push(`<text>${"-".repeat(COLUMNS)}&#10;</text>`);
  if (data.taxAmount > 0) {
    rows.push(
      `<text>${escapeXml(receiptLine("Subtotal", `$${subtotal.toFixed(2)}`))}&#10;</text>`,
    );
    rows.push(`<text>${escapeXml(receiptLine("Tax", `$${data.taxAmount.toFixed(2)}`))}&#10;</text>`);
  }
  const total = subtotal + data.taxAmount;
  rows.push(
    `<text width="2" height="2">${escapeXml(receiptLine("Total", `$${total.toFixed(2)}`))}&#10;</text>`,
  );
  rows.push(`<feed line="3"/>`);
  rows.push(`<cut type="feed"/>`);

  return `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
  <s:Body>
    <epos-print xmlns="http://www.epson-biz.com/pos/service/2011/03/epos-print">
      ${rows.join("\n      ")}
    </epos-print>
  </s:Body>
</s:Envelope>`;
}

export async function printReceiptToEpson(
  printerUrl: string,
  data: ThermalReceiptData,
): Promise<void> {
  const base = /^https?:\/\//i.test(printerUrl) ? printerUrl : `http://${printerUrl}`;
  const url = `${base.replace(/\/$/, "")}/cgi-bin/epos/service.cgi?devid=local_printer&timeout=10000`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8" },
    body: buildEposPrintXml(data),
  });
  if (!res.ok) {
    throw new Error(`Printer responded with status ${res.status}`);
  }
}
