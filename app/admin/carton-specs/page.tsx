import { createClient } from "@/lib/supabase/server";
import { createCartonSpec } from "./actions";

export default async function CartonSpecsPage() {
  const supabase = await createClient();
  const { data: cartonSpecs, error } = await supabase
    .from("carton_specs")
    .select("id, name, length_in, width_in, height_in, max_weight_oz")
    .order("max_weight_oz");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Carton specs</h1>
        <p className="max-w-lg text-sm text-neutral-600">
          Generic box sizes shared across the whole catalog — not assigned
          per item. The packing suggestion on a fair&apos;s allocation page
          picks whichever of these needs the fewest boxes for that fair&apos;s
          total allocated weight (weight-only estimate, not true
          volumetric/dimensional packing).
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error.message}</p>}

      <table className="w-full max-w-2xl text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-left">
            <th className="py-1 pr-4">Name</th>
            <th className="py-1 pr-4">L × W × H (in)</th>
            <th className="py-1 pr-4">Max weight (oz)</th>
          </tr>
        </thead>
        <tbody>
          {cartonSpecs?.map((spec) => (
            <tr key={spec.id} className="border-b border-neutral-100">
              <td className="py-1 pr-4">{spec.name}</td>
              <td className="py-1 pr-4">
                {spec.length_in} × {spec.width_in} × {spec.height_in}
              </td>
              <td className="py-1 pr-4">{spec.max_weight_oz}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <form action={createCartonSpec} className="flex max-w-sm flex-col gap-2">
        <h2 className="font-medium">New carton spec</h2>
        <input name="name" required placeholder="Name (e.g. X-Large)" className="rounded border border-neutral-300 px-2 py-1" />
        <div className="grid grid-cols-3 gap-2">
          <input
            name="length_in"
            type="number"
            step="0.1"
            required
            placeholder="Length (in)"
            className="rounded border border-neutral-300 px-2 py-1"
          />
          <input
            name="width_in"
            type="number"
            step="0.1"
            required
            placeholder="Width (in)"
            className="rounded border border-neutral-300 px-2 py-1"
          />
          <input
            name="height_in"
            type="number"
            step="0.1"
            required
            placeholder="Height (in)"
            className="rounded border border-neutral-300 px-2 py-1"
          />
        </div>
        <input
          name="max_weight_oz"
          type="number"
          step="1"
          required
          placeholder="Max weight (oz)"
          className="rounded border border-neutral-300 px-2 py-1"
        />
        <button type="submit" className="rounded bg-neutral-900 px-3 py-1.5 text-white">
          Add carton spec
        </button>
      </form>
    </div>
  );
}
