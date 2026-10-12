import { Field, Input, Select, Button } from "@/components/ui";

// Plain GET <form> — no JS needed, native browser navigation updates the
// query string, consistent with this app's existing no-JS-picker
// convention (FairPicker/TemplatePicker just navigate on change; this is
// the same idea for a multi-field filter bar with a submit button
// instead of per-field auto-navigation).
export function FilterBar({
  action,
  start,
  end,
  orgId,
  fairId,
  orgs,
  fairs,
}: {
  action: string;
  start?: string;
  end?: string;
  orgId?: string;
  fairId?: string;
  orgs: { id: string; name: string }[];
  fairs: { id: string; name: string; orgName: string }[];
}) {
  return (
    <form method="GET" action={action} className="flex flex-wrap items-end gap-3">
      <Field label="Start date">
        <Input type="date" name="start" defaultValue={start ?? ""} />
      </Field>
      <Field label="End date">
        <Input type="date" name="end" defaultValue={end ?? ""} />
      </Field>
      <Field label="Organization">
        <Select name="org_id" defaultValue={orgId ?? ""}>
          <option value="">All organizations</option>
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Fair">
        <Select name="fair_id" defaultValue={fairId ?? ""}>
          <option value="">All fairs</option>
          {fairs.map((f) => (
            <option key={f.id} value={f.id}>
              {f.orgName} — {f.name}
            </option>
          ))}
        </Select>
      </Field>
      <Button type="submit" size="sm" variant="outline">
        Filter
      </Button>
    </form>
  );
}
