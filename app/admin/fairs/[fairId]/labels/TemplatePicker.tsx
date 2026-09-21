"use client";

import { useRouter } from "next/navigation";
import { Select } from "@/components/ui";

// Same URL-driven round trip as app/org/events/request/FairPicker.tsx —
// no client Supabase call, just a route change that re-renders the
// Server Component below with the newly chosen template.
export function TemplatePicker({
  fairId,
  templates,
  selectedTemplateId,
}: {
  fairId: string;
  templates: { id: string; name: string }[];
  selectedTemplateId: string;
}) {
  const router = useRouter();

  return (
    <Select
      name="template_id"
      defaultValue={selectedTemplateId}
      onChange={(e) => router.push(`/admin/fairs/${fairId}/labels?template_id=${e.target.value}`)}
    >
      {templates.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </Select>
  );
}
