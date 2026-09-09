import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createFair } from "./actions";

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
      <h1 className="text-lg font-semibold">Fairs</h1>

      {fairsError && <p className="text-sm text-red-600">{fairsError.message}</p>}

      <table className="w-full max-w-2xl text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-left">
            <th className="py-1 pr-4">Fair</th>
            <th className="py-1 pr-4">Org</th>
            <th className="py-1 pr-4">Dates</th>
            <th className="py-1 pr-4">Status</th>
            <th className="py-1 pr-4" />
          </tr>
        </thead>
        <tbody>
          {fairs?.map((fair) => (
            <tr key={fair.id} className="border-b border-neutral-100">
              <td className="py-1 pr-4">{fair.name}</td>
              <td className="py-1 pr-4">
                {(fair.organizations as unknown as { name: string } | null)?.name}
              </td>
              <td className="py-1 pr-4">
                {fair.start_date} – {fair.end_date}
              </td>
              <td className="py-1 pr-4">{fair.status}</td>
              <td className="py-1 pr-4">
                <Link href={`/admin/fairs/${fair.id}/allocations`} className="underline">
                  Allocate
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <form action={createFair} className="flex max-w-sm flex-col gap-2">
        <h2 className="font-medium">New fair</h2>
        <select name="org_id" required className="rounded border border-neutral-300 px-2 py-1">
          <option value="">Select organization…</option>
          {organizations?.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
            </option>
          ))}
        </select>
        <input
          name="name"
          required
          placeholder="Fair name"
          className="rounded border border-neutral-300 px-2 py-1"
        />
        <label className="text-xs text-neutral-600">
          Start date
          <input
            name="start_date"
            type="date"
            required
            className="mt-1 block w-full rounded border border-neutral-300 px-2 py-1"
          />
        </label>
        <label className="text-xs text-neutral-600">
          End date
          <input
            name="end_date"
            type="date"
            required
            className="mt-1 block w-full rounded border border-neutral-300 px-2 py-1"
          />
        </label>
        <label className="text-xs text-neutral-600">
          Return deadline
          <input
            name="return_deadline"
            type="date"
            required
            className="mt-1 block w-full rounded border border-neutral-300 px-2 py-1"
          />
        </label>
        <button type="submit" className="rounded bg-neutral-900 px-3 py-1.5 text-white">
          Create
        </button>
      </form>
    </div>
  );
}
