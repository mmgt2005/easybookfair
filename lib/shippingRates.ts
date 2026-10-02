// Real shipping-rate estimates via ShipEngine's "Rate Estimates" endpoint
// (POST /v1/rates/estimate) — plain fetch, no SDK, since the request/
// response shape is small and verified directly against ShipEngine's own
// OpenAPI spec rather than guessed. This endpoint never creates a
// shipment or purchases a label; it's rate-lookup only, matching this
// app's "estimate only" scope.
//
// Unlike EasyPost (this file's previous provider), ShipEngine's estimate
// endpoint requires a full city/state/postal/country on BOTH ends, not
// just a ZIP + country — so callers must supply a complete ShippingAddress
// for both origin and destination, not a bare ZIP string.
const SHIPENGINE_BASE_URL = "https://api.shipengine.com";

// Same "unconfigured" detection convention as lib/stripe.ts's stripeMode()
// — lets the UI hide/disable the feature instead of crashing when no key
// is set, since this is an optional add-on, not a core money flow.
export function shippingRatesConfigured(): boolean {
  return !!process.env.SHIPENGINE_API_KEY && !!process.env.SHIPENGINE_CARRIER_ID;
}

export type ShippingAddress = {
  countryCode: string;
  postalCode: string;
  cityLocality: string;
  stateProvince: string;
};

export type ShippingParcel = {
  weightOz: number;
  lengthIn: number;
  widthIn: number;
  heightIn: number;
};

export type ShippingEstimate = { totalCost: number; carrierService: string } | null;

type RateEstimateResponse = {
  carrier_friendly_name: string;
  service_type: string;
  shipping_amount: { currency: string; amount: number } | null;
  error_messages?: string[];
}[];

// This app's single warehouse/staging address — a platform-wide physical
// location, not per-org/per-fair (env vars, same convention as
// NEXT_PUBLIC_SITE_URL/Stripe/Resend keys).
export function originAddress(): ShippingAddress {
  return {
    countryCode: process.env.SHIPPING_ORIGIN_COUNTRY || "US",
    postalCode: process.env.SHIPPING_ORIGIN_ZIP || "",
    cityLocality: process.env.SHIPPING_ORIGIN_CITY || "",
    stateProvince: process.env.SHIPPING_ORIGIN_STATE || "",
  };
}

// One rate-estimate call per physical carton (cartons ship as separate
// packages, each priced on its own), summing the cheapest usable rate for
// each. carrier_ids is the one or more ShipEngine carrier ids connected to
// this account (e.g. its built-in USPS carrier) — a one-time constant
// from the ShipEngine dashboard, not derived from the shipment itself.
//
// Returns null (never throws) when no usable rate could be obtained for
// any parcel, so the caller can show "couldn't get a rate" instead of
// crashing the page — a ShipEngine/network failure here must never break
// the allocations screen.
export async function estimateShippingCost(
  origin: ShippingAddress,
  destination: ShippingAddress,
  parcels: ShippingParcel[],
): Promise<ShippingEstimate> {
  if (parcels.length === 0) return null;

  const apiKey = process.env.SHIPENGINE_API_KEY;
  const carrierId = process.env.SHIPENGINE_CARRIER_ID;
  if (!apiKey || !carrierId) return null;

  try {
    const rates = await Promise.all(
      parcels.map(async (parcel) => {
        const res = await fetch(`${SHIPENGINE_BASE_URL}/v1/rates/estimate`, {
          method: "POST",
          headers: { "API-Key": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({
            carrier_ids: [carrierId],
            from_country_code: origin.countryCode,
            from_postal_code: origin.postalCode,
            from_city_locality: origin.cityLocality,
            from_state_province: origin.stateProvince,
            to_country_code: destination.countryCode,
            to_postal_code: destination.postalCode,
            to_city_locality: destination.cityLocality,
            to_state_province: destination.stateProvince,
            weight: { value: parcel.weightOz, unit: "ounce" },
            dimensions: {
              unit: "inch",
              length: parcel.lengthIn,
              width: parcel.widthIn,
              height: parcel.heightIn,
            },
            ship_date: new Date().toISOString(),
          }),
        });

        if (!res.ok) {
          throw new Error(`ShipEngine rate estimate request failed: ${res.status}`);
        }

        const estimates = (await res.json()) as RateEstimateResponse;
        const usable = estimates.filter(
          (e) => !e.error_messages?.length && e.shipping_amount !== null,
        );
        if (usable.length === 0) {
          throw new Error("ShipEngine returned no usable rate for this parcel");
        }

        return usable.reduce((cheapest, e) =>
          e.shipping_amount!.amount < cheapest.shipping_amount!.amount ? e : cheapest,
        );
      }),
    );

    const totalCost = rates.reduce((sum, rate) => sum + rate.shipping_amount!.amount, 0);
    const first = rates[0];
    return { totalCost, carrierService: `${first.carrier_friendly_name} ${first.service_type}` };
  } catch (err) {
    console.error("Failed to estimate shipping cost via ShipEngine", err);
    return null;
  }
}
