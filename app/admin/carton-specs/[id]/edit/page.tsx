import { createClient } from "@/lib/supabase/server";
import { updateCartonSpec } from "../../actions";
import { Button, Card, Input } from "@/components/ui";

export default async function EditCartonSpecPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: spec, error } = await supabase
    .from("carton_specs")
    .select("id, name, length_in, width_in, height_in, max_weight_oz")
    .eq("id", id)
    .single();

  if (error || !spec) {
    return <p className="text-sm text-red-600">Carton spec not found.</p>;
  }

  const updateCartonSpecForSpec = updateCartonSpec.bind(null, id);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-2xl font-bold text-neutral-900">Edit carton spec 📦</h1>
      <Card className="max-w-sm">
        <form action={updateCartonSpecForSpec} className="flex flex-col gap-3">
          <Input name="name" required defaultValue={spec.name} placeholder="Name (e.g. X-Large)" />
          <div className="grid grid-cols-3 gap-2">
            <Input
              name="length_in"
              type="number"
              step="0.1"
              required
              defaultValue={spec.length_in}
              placeholder="Length (in)"
            />
            <Input
              name="width_in"
              type="number"
              step="0.1"
              required
              defaultValue={spec.width_in}
              placeholder="Width (in)"
            />
            <Input
              name="height_in"
              type="number"
              step="0.1"
              required
              defaultValue={spec.height_in}
              placeholder="Height (in)"
            />
          </div>
          <Input
            name="max_weight_oz"
            type="number"
            step="1"
            required
            defaultValue={spec.max_weight_oz}
            placeholder="Max weight (oz)"
          />
          <Button type="submit">Save changes</Button>
        </form>
      </Card>
    </div>
  );
}
