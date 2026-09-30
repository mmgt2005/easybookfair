import EasyPost from "@easypost/api";

// The SDK's default export is a const typed `typeof <the class>` (a
// constructor type), not the class itself re-exported as a type — so the
// instance type has to be derived via InstanceType rather than used
// directly as `: EasyPost`.
type EasyPostClient = InstanceType<typeof EasyPost>;

let cached: EasyPostClient | null = null;

export function getEasyPost(): EasyPostClient {
  if (!cached) {
    const apiKey = process.env.EASYPOST_API_KEY;
    if (!apiKey) throw new Error("EASYPOST_API_KEY is not set");
    cached = new EasyPost(apiKey);
  }
  return cached;
}

// Same "unconfigured" detection convention as lib/stripe.ts's stripeMode()
// — lets the UI hide/disable the feature instead of crashing when no key
// is set, since this is an optional add-on, not a core money flow.
export function shippingRatesConfigured(): boolean {
  return !!process.env.EASYPOST_API_KEY;
}

export type ShippingParcel = {
  weightOz: number;
  lengthIn: number;
  widthIn: number;
  heightIn: number;
};

export type ShippingEstimate = { totalCost: number; carrierService: string } | null;

function originAddress() {
  return {
    name: process.env.SHIPPING_ORIGIN_NAME || undefined,
    street1: process.env.SHIPPING_ORIGIN_STREET1,
    city: process.env.SHIPPING_ORIGIN_CITY,
    state: process.env.SHIPPING_ORIGIN_STATE,
    zip: process.env.SHIPPING_ORIGIN_ZIP,
    country: process.env.SHIPPING_ORIGIN_COUNTRY || "US",
  };
}

// One EasyPost Shipment per physical carton (cartons ship as separate
// packages, each priced on its own), summing each parcel's cheapest rate
// across all available carriers on the account. Origin is this app's
// single warehouse address (env vars — a platform-wide physical location,
// not per-org/per-fair); destination is the org's own shipping_postal_code
// (migration 0066). Only a ZIP + country is needed for a rate estimate —
// EasyPost rates domestic shipments from ZIP-to-ZIP without a full street
// address on the destination side.
//
// Returns null (never throws) when no usable rate could be obtained for
// any parcel, so the caller can show "couldn't get a rate" instead of
// crashing the page — an EasyPost/network failure here must never break
// the allocations screen.
export async function estimateShippingCost(
  originZip: string,
  destinationZip: string,
  parcels: ShippingParcel[],
): Promise<ShippingEstimate> {
  if (parcels.length === 0) return null;

  try {
    const client = getEasyPost();
    const from = { ...originAddress(), zip: originZip };
    const to = { zip: destinationZip, country: "US" };

    const rates = await Promise.all(
      parcels.map(async (parcel) => {
        const shipment = await client.Shipment.create({
          to_address: to,
          from_address: from,
          parcel: {
            weight: parcel.weightOz,
            length: parcel.lengthIn,
            width: parcel.widthIn,
            height: parcel.heightIn,
          },
        });
        return shipment.lowestRate();
      }),
    );

    const totalCost = rates.reduce((sum, rate) => sum + Number(rate.rate), 0);
    const first = rates[0];
    return { totalCost, carrierService: `${first.carrier} ${first.service}` };
  } catch (err) {
    console.error("Failed to estimate shipping cost via EasyPost", err);
    return null;
  }
}
