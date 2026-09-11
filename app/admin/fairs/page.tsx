import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createFair } from "./actions";
import { Badge, Button, Card, Field, Input, PageHeader, Select, statusTone } from "@/components/ui";

export default async function FairsPage() {
  const supabase = await createClient();

  const [{ data: fairs, error: fairsError }, { data: organizations }] = await Promise.all([
    supabase
      .from("fairs")
      .select("id, name, status, start_date, end_date, organizations(name)")
      .order("start_date", { ascending: false }),
    supabase.from("organizations").select("id, name").order("name"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Fairs 🎪" />

      {fairsError && <p className="text-sm text-red-600">{fairsError.message}</p>}

      <Card className="overflow-x-auto p-0">
        <table className="w-full max-w-2xl text-sm">
          <thead>
            <tr className="border-b border-neutral-100 bg-neutral-50 text-left">
              <th className="py-2 pl-4 pr-4">Fair</th>
              <th className="py-2 pr-4">Org</th>
              <th className="py-2 pr-4">Dates</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4" />
            </tr>
          </thead>
          <tbody>
            {fairs?.map((fair) => (
              <tr key={fair.id} className="border-b border-neutral-50 last:border-0">
                <td className="py-2 pl-4 pr-4 font-semibold text-neutral-800">{fair.name}</td>
                <td className="py-2 pr-4 text-neutral-600">
                  {(fair.organizations as unknown as { name: string } | null)?.name}
                </td>
                <td className="py-2 pr-4 text-neutral-600">
                  {fair.start_date} – {fair.end_date}
                </td>
                <td className="py-2 pr-4">
                  <Badge tone={statusTone(fair.status)}>{fair.status}</Badge>
                </td>
                <td className="flex gap-3 py-2 pr-4">
                  <Link
                    href={`/admin/fairs/${fair.id}/allocations`}
                    className="font-semibold text-accent-600 hover:underline"
                  >
                    Allocate
                  </Link>
                  <Link
                    href={`/admin/fairs/${fair.id}/edit`}
                    className="font-semibold text-accent-600 hover:underline"
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="max-w-sm">
        <form action={createFair} className="flex flex-col gap-3">
          <h2 className="font-heading font-bold text-neutral-900">New fair</h2>
          <Select name="org_id" required defaultValue="">
            <option value="">Select organization…</option>
            {organizations?.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </Select>
          <Input name="name" required placeholder="Fair name" />
          <Field label="Start date">
            <Input name="start_date" type="date" required />
          </Field>
          <Field label="End date">
            <Input name="end_date" type="date" required />
          </Field>
          <Field label="Return deadline">
            <Input name="return_deadline" type="date" required />
          </Field>
          <Button type="submit">Create</Button>
        </form>
      </Card>
    </div>
  );
}
