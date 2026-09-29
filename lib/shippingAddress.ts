// Shared FormData -> shipping-address-fields parsing, reused by every
// Server Action that reads the fields components/ShippingAddressFields.tsx
// renders (submitOrgSignup, approveOrgSignup, createOrganization,
// updateOrganization, updateOrgShippingAddress — migration 0066).
export type ShippingAddressInput = {
  shipping_contact_name: string | null;
  shipping_contact_phone: string | null;
  shipping_address_line1: string | null;
  shipping_address_line2: string | null;
  shipping_city: string | null;
  shipping_state: string | null;
  shipping_postal_code: string | null;
  shipping_country: string;
};

export function parseShippingAddress(formData: FormData): ShippingAddressInput {
  const field = (name: string) => String(formData.get(name) ?? "").trim() || null;
  return {
    shipping_contact_name: field("shipping_contact_name"),
    shipping_contact_phone: field("shipping_contact_phone"),
    shipping_address_line1: field("shipping_address_line1"),
    shipping_address_line2: field("shipping_address_line2"),
    shipping_city: field("shipping_city"),
    shipping_state: field("shipping_state"),
    shipping_postal_code: field("shipping_postal_code"),
    shipping_country: field("shipping_country") ?? "US",
  };
}
