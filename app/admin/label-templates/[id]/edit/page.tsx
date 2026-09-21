import { createClient } from "@/lib/supabase/server";
import { updateLabelTemplate } from "../../actions";
import { LabelTemplateFormFields } from "../../LabelTemplateFormFields";
import { Card, PageHeader } from "@/components/ui";

export default async function EditLabelTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: t, error } = await supabase
    .from("label_templates")
    .select(
      "id, name, sheet_width_in, sheet_height_in, label_width_in, label_height_in, margin_top_in, margin_left_in, gap_x_in, gap_y_in, columns, rows",
    )
    .eq("id", id)
    .single();

  if (error || !t) {
    return <p className="text-sm text-red-600">Label template not found.</p>;
  }

  const updateForTemplate = updateLabelTemplate.bind(null, id);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Edit label template 🏷️" backHref="/admin/label-templates" />
      <Card className="max-w-2xl">
        <LabelTemplateFormFields action={updateForTemplate} submitLabel="Save changes" defaultValues={t} />
      </Card>
    </div>
  );
}
