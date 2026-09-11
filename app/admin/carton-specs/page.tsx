import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createCartonSpec, deleteCartonSpec } from "./actions";
import { Button, Card, Input, PageHeader } from "@/components/ui";

export default async function CartonSpecsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error: errorMessage } = await searchParams;
  const supabase = await createClient();
  const { data: cartonSpecs, error } = await supabase
    .from("carton_specs")
    .select("id, name, length_in, width_in, height_in, max_weight_oz")
    .order("max_weight_oz");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Carton specs 📦"
        description="Generic box sizes shared across the whole catalog — not assigned per item. The packing suggestion on a fair's allocation page picks whichever of these needs the fewest boxes for that fair's total allocated weight (weight-only estimate, not true volumetric/dimensional packing)."
      />

      {error && <p className="text-sm text-red-600">{error.message}</p>}
      {errorMessage && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p>
      )}

      <Card className="overflow-x-auto p-0">
        <table className="w-full max-w-2xl text-sm">
          <thead>
            <tr className="border-b border-neutral-100 bg-neutral-50 text-left">
              <th className="py-2 pl-4 pr-4">Name</th>
              <th className="py-2 pr-4">L × W × H (in)</th>
              <th className="py-2 pr-4">Max weight (oz)</th>
              <th className="py-2 pr-4" />
            </tr>
          </thead>
          <tbody>
            {cartonSpecs?.map((spec) => (
              <tr key={spec.id} className="border-b border-neutral-50 last:border-0">
                <td className="py-2 pl-4 pr-4 font-semibold text-neutral-800">{spec.name}</td>
                <td className="py-2 pr-4 text-neutral-600">
                  {spec.length_in} × {spec.width_in} × {spec.height_in}
                </td>
                <td className="py-2 pr-4 text-neutral-600">{spec.max_weight_oz}</td>
                <td className="flex gap-3 py-2 pr-4">
                  <Link
                    href={`/admin/carton-specs/${spec.id}/edit`}
                    className="font-semibold text-accent-600 hover:underline"
                  >
                    Edit
                  </Link>
                  <form action={deleteCartonSpec}>
                    <input type="hidden" name="id" value={spec.id} />
                    <button
                      type="submit"
                      className="font-semibold text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="max-w-sm">
        <form action={createCartonSpec} className="flex flex-col gap-3">
          <h2 className="font-heading font-bold text-neutral-900">New carton spec</h2>
          <Input name="name" required placeholder="Name (e.g. X-Large)" />
          <div className="grid grid-cols-3 gap-2">
            <Input name="length_in" type="number" step="0.1" required placeholder="Length (in)" />
            <Input name="width_in" type="number" step="0.1" required placeholder="Width (in)" />
            <Input name="height_in" type="number" step="0.1" required placeholder="Height (in)" />
          </div>
          <Input name="max_weight_oz" type="number" step="1" required placeholder="Max weight (oz)" />
          <Button type="submit">Add carton spec</Button>
        </form>
      </Card>
    </div>
  );
}
