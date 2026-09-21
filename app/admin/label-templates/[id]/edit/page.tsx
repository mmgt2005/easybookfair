import { createClient } from "@/lib/supabase/server";
import { updateLabelTemplate } from "../../actions";
import { Button, Card, Input } from "@/components/ui";

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
      <h1 className="font-heading text-2xl font-bold text-neutral-900">Edit label template 🏷️</h1>
      <Card className="max-w-sm">
        <form action={updateForTemplate} className="flex flex-col gap-3">
          <Input name="name" required defaultValue={t.name} placeholder="Name" />
          <p className="text-xs font-semibold text-neutral-500">Sheet size (in)</p>
          <div className="grid grid-cols-2 gap-2">
            <Input
              name="sheet_width_in"
              type="number"
              step="0.01"
              required
              defaultValue={t.sheet_width_in}
              placeholder="Width"
            />
            <Input
              name="sheet_height_in"
              type="number"
              step="0.01"
              required
              defaultValue={t.sheet_height_in}
              placeholder="Height"
            />
          </div>
          <p className="text-xs font-semibold text-neutral-500">Label size (in)</p>
          <div className="grid grid-cols-2 gap-2">
            <Input
              name="label_width_in"
              type="number"
              step="0.01"
              required
              defaultValue={t.label_width_in}
              placeholder="Width"
            />
            <Input
              name="label_height_in"
              type="number"
              step="0.01"
              required
              defaultValue={t.label_height_in}
              placeholder="Height"
            />
          </div>
          <p className="text-xs font-semibold text-neutral-500">Margins (in, from top-left)</p>
          <div className="grid grid-cols-2 gap-2">
            <Input
              name="margin_top_in"
              type="number"
              step="0.01"
              defaultValue={t.margin_top_in}
              placeholder="Top"
            />
            <Input
              name="margin_left_in"
              type="number"
              step="0.01"
              defaultValue={t.margin_left_in}
              placeholder="Left"
            />
          </div>
          <p className="text-xs font-semibold text-neutral-500">Gaps between labels (in)</p>
          <div className="grid grid-cols-2 gap-2">
            <Input
              name="gap_x_in"
              type="number"
              step="0.01"
              defaultValue={t.gap_x_in}
              placeholder="Horizontal"
            />
            <Input
              name="gap_y_in"
              type="number"
              step="0.01"
              defaultValue={t.gap_y_in}
              placeholder="Vertical"
            />
          </div>
          <p className="text-xs font-semibold text-neutral-500">Grid</p>
          <div className="grid grid-cols-2 gap-2">
            <Input
              name="columns"
              type="number"
              min={1}
              required
              defaultValue={t.columns}
              placeholder="Columns"
            />
            <Input name="rows" type="number" min={1} required defaultValue={t.rows} placeholder="Rows" />
          </div>
          <Button type="submit">Save changes</Button>
        </form>
      </Card>
    </div>
  );
}
