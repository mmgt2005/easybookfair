import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createLabelTemplate, deleteLabelTemplate } from "./actions";
import { LabelTemplateFormFields } from "./LabelTemplateFormFields";
import { Card, PageHeader } from "@/components/ui";

export default async function LabelTemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error: errorMessage } = await searchParams;
  const supabase = await createClient();
  const { data: templates, error } = await supabase
    .from("label_templates")
    .select(
      "id, name, sheet_width_in, sheet_height_in, label_width_in, label_height_in, margin_top_in, margin_left_in, gap_x_in, gap_y_in, columns, rows",
    )
    .order("name");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Label templates 🏷️"
        description="Sheet/label geometry shared across the whole catalog — configured once here, then picked when printing labels for a fair's allocation (packing time)."
      />

      {error && <p className="text-sm text-red-600">{error.message}</p>}
      {errorMessage && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p>
      )}

      <Card className="overflow-x-auto p-0">
        <table className="w-full max-w-4xl text-sm">
          <thead>
            <tr className="border-b border-neutral-100 bg-neutral-50 text-left">
              <th className="py-2 pl-4 pr-4">Name</th>
              <th className="py-2 pr-4">Sheet (in)</th>
              <th className="py-2 pr-4">Label (in)</th>
              <th className="py-2 pr-4">Grid</th>
              <th className="py-2 pr-4" />
            </tr>
          </thead>
          <tbody>
            {templates?.map((t) => (
              <tr key={t.id} className="border-b border-neutral-50 last:border-0">
                <td className="py-2 pl-4 pr-4 font-semibold text-neutral-800">{t.name}</td>
                <td className="py-2 pr-4 text-neutral-600">
                  {t.sheet_width_in} × {t.sheet_height_in}
                </td>
                <td className="py-2 pr-4 text-neutral-600">
                  {t.label_width_in} × {t.label_height_in}
                </td>
                <td className="py-2 pr-4 text-neutral-600">
                  {t.columns} × {t.rows} ({t.columns * t.rows}/sheet)
                </td>
                <td className="flex gap-3 py-2 pr-4">
                  <Link
                    href={`/admin/label-templates/${t.id}/edit`}
                    className="font-semibold text-accent-600 hover:underline"
                  >
                    Edit
                  </Link>
                  <form action={deleteLabelTemplate}>
                    <input type="hidden" name="id" value={t.id} />
                    <button type="submit" className="font-semibold text-red-600 hover:underline">
                      Delete
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {(templates ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="py-4 pl-4 text-neutral-500">
                  No label templates yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Card className="max-w-2xl">
        <h2 className="mb-3 font-heading font-bold text-neutral-900">New label template</h2>
        <LabelTemplateFormFields action={createLabelTemplate} submitLabel="Add label template" />
      </Card>
    </div>
  );
}
