import QRCode from "qrcode";

// Renders as a plain <img src="data:..."> in a Server Component — no
// canvas/DOM dependency needed, unlike QRCode's SVG string output, which
// would require dangerouslySetInnerHTML for no real benefit here.
export async function qrCodeDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, { margin: 1, width: 240 });
}
