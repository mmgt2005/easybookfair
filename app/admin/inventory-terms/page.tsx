import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createInventoryTermsVersion } from "./actions";
import { Button, Card, Field, PageHeader, Textarea } from "@/components/ui";

const MERGE_TOKENS = [
  { token: "{{line_items}}", description: "a list of every book/quantity/cost in the request" },
  { token: "{{total_wholesale_amount}}", description: "the combined dollar total across all items" },
  { token: "{{author_name}}", description: "the author's name" },
  { token: "{{request_date}}", description: "the date the request was sent" },
];

export default async function InventoryTermsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireAdmin();
  const { error: errorMessage } = await searchParams;
  const supabase = await createClient();
  const service = createServiceClient();

  const { data: versions } = await supabase
    .from("inventory_terms_versions")
    .select("id, version, terms_text, created_by, created_at")
    .order("version", { ascending: false });

  const withEmails = await Promise.all(
    (versions ?? []).map(async (v) => {
      if (!v.created_by) return { ...v, email: "(seeded placeholder)" };
      const { data } = await service.auth.admin.getUserById(v.created_by);
      return { ...v, email: data.user?.email ?? "(unknown)" };
    }),
  );

  const current = withEmails[0];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        backHref="/admin/authors"
        title="Inventory request terms 📄"
        description="The standardized agreement merged into every new author inventory request. Not legal advice — review and adjust the wording for your own situation. Saving creates a new version; every past request keeps whatever version was current when it was sent."
      />

      {errorMessage && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p>
      )}

      <Card className="max-w-2xl">
        <h2 className="font-heading font-bold text-neutral-900">Merge tokens</h2>
        <ul className="mt-2 flex flex-col gap-1 text-sm text-neutral-600">
          {MERGE_TOKENS.map((t) => (
            <li key={t.token}>
              <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs">{t.token}</code> —{" "}
              {t.description}
            </li>
          ))}
        </ul>
      </Card>

      <Card className="max-w-2xl">
        <h2 className="font-heading font-bold text-neutral-900">
          Current standard terms{current && ` (version ${current.version})`}
        </h2>
        <form action={createInventoryTermsVersion} className="mt-2 flex flex-col gap-3">
          <Field label="Terms text">
            <Textarea
              name="terms_text"
              rows={16}
              defaultValue={current?.terms_text ?? ""}
              className="font-mono text-xs"
            />
          </Field>
          <Button type="submit" size="sm">
            Save new version
          </Button>
        </form>
      </Card>

      {withEmails.length > 1 && (
        <Card className="max-w-2xl">
          <h2 className="font-heading font-bold text-neutral-900">Version history</h2>
          <div className="mt-2 flex flex-col gap-2">
            {withEmails.slice(1).map((v) => (
              <details key={v.id} className="rounded-lg border border-neutral-100 p-2">
                <summary className="cursor-pointer text-sm font-semibold text-neutral-700">
                  Version {v.version} — {v.email} —{" "}
                  {new Date(v.created_at).toLocaleDateString()}
                </summary>
                <pre className="mt-2 whitespace-pre-wrap text-xs text-neutral-600">
                  {v.terms_text}
                </pre>
              </details>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
