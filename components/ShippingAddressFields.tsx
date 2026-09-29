import { Field, Input } from "@/components/ui";

type ShippingAddressValues = {
  shipping_contact_name?: string | null;
  shipping_contact_phone?: string | null;
  shipping_address_line1?: string | null;
  shipping_address_line2?: string | null;
  shipping_city?: string | null;
  shipping_state?: string | null;
  shipping_postal_code?: string | null;
  shipping_country?: string | null;
};

// Reused as-is on /join, the admin's "create organization"/"edit
// organization" forms, and /org/staff's per-org edit form (migration
// 0066) — same field names everywhere, so a single component keeps all
// four forms in sync instead of four hand-copied field lists drifting
// apart. `required` only applies to the street/city/state/ZIP fields
// (not Attn/phone/line 2/country) — on by default for the public /join
// form, where an address is the actual point; off for the admin's quick
// internal "create organization" scaffolding form, where it isn't.
export function ShippingAddressFields({
  initial,
  required = false,
}: {
  initial?: ShippingAddressValues;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-neutral-50 p-3">
      <p className="text-xs font-semibold text-neutral-600">
        Shipping address — where inventory gets sent for this org&apos;s fairs
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Attn (optional)">
          <Input
            name="shipping_contact_name"
            defaultValue={initial?.shipping_contact_name ?? ""}
            placeholder="Who receives the boxes, if different"
          />
        </Field>
        <Field label="Phone (optional)">
          <Input
            name="shipping_contact_phone"
            type="tel"
            defaultValue={initial?.shipping_contact_phone ?? ""}
          />
        </Field>
      </div>
      <Field label="Street address">
        <Input
          name="shipping_address_line1"
          required={required}
          defaultValue={initial?.shipping_address_line1 ?? ""}
        />
      </Field>
      <Field label="Address line 2 (optional)">
        <Input
          name="shipping_address_line2"
          defaultValue={initial?.shipping_address_line2 ?? ""}
        />
      </Field>
      <div className="grid grid-cols-3 gap-2">
        <Field label="City">
          <Input name="shipping_city" required={required} defaultValue={initial?.shipping_city ?? ""} />
        </Field>
        <Field label="State">
          <Input
            name="shipping_state"
            required={required}
            defaultValue={initial?.shipping_state ?? ""}
          />
        </Field>
        <Field label="ZIP">
          <Input
            name="shipping_postal_code"
            required={required}
            defaultValue={initial?.shipping_postal_code ?? ""}
          />
        </Field>
      </div>
      <Field label="Country">
        <Input
          name="shipping_country"
          defaultValue={initial?.shipping_country ?? "US"}
          className="w-24"
        />
      </Field>
    </div>
  );
}
