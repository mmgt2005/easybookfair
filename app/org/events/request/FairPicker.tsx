"use client";

import { useRouter } from "next/navigation";
import { Select } from "@/components/ui";

// Navigates to re-render this Server Component with the chosen fair's id
// in the URL, which then re-queries allocations for that fair to build
// the book picker below — this app fetches every list server-side, so a
// URL-driven round trip matches existing convention instead of adding
// client-side Supabase calls.
export function FairPicker({
  fairs,
  selectedFairId,
}: {
  fairs: { id: string; name: string }[];
  selectedFairId: string;
}) {
  const router = useRouter();

  return (
    <Select
      name="fair_id"
      required
      defaultValue={selectedFairId}
      onChange={(e) => router.push(`/org/events/request?fair_id=${e.target.value}`)}
    >
      <option value="" disabled>
        Select fair…
      </option>
      {fairs.map((fair) => (
        <option key={fair.id} value={fair.id}>
          {fair.name}
        </option>
      ))}
    </Select>
  );
}
