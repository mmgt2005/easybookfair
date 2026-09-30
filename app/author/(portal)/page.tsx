import Link from "next/link";
import { requireAuthor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, PageHeader, statusTone } from "@/components/ui";
import { AuthorPublicProfile } from "@/components/AuthorPublicProfile";
import { AuthorProfileForm } from "./AuthorProfileForm";

type PublicBook = { catalog_item_id: string; title: string; description: string | null; image_url: string | null };

export default async function AuthorDashboard() {
  const { name, authorUserId, email, bio, website } = await requireAuthor();
  const supabase = await createClient();

  // Explicit author_user_id filter, not just RLS (author_submissions_
  // select already scopes a genuine author's own session via auth.uid())
  // — an admin "viewing as" this author (lib/viewAs.ts) has full RLS
  // visibility via app.is_platform_admin(), so without this filter
  // they'd see every author's submissions mixed together here.
  const { data: submissions } = await supabase
    .from("author_submissions")
    .select(
      "id, title, item_type, suggested_retail_price, wholesale_price, status, admin_note, catalog_item_id, created_at",
    )
    .eq("author_user_id", authorUserId)
    .order("created_at", { ascending: false });

  const catalogItemIds = (submissions ?? [])
    .map((s) => s.catalog_item_id)
    .filter((id): id is string => id !== null);

  // RLS (sales_select_author, migration 0040) already scopes this to only
  // the author's own catalog items — no explicit filter needed beyond the
  // id list itself.
  const { data: sales } =
    catalogItemIds.length > 0
      ? await supabase
          .from("sales")
          .select("catalog_item_id, price_charged")
          .in("catalog_item_id", catalogItemIds)
          .eq("status", "completed")
      : { data: [] };

  const salesByItem = new Map<string, { units: number; revenue: number }>();
  for (const sale of sales ?? []) {
    const entry = salesByItem.get(sale.catalog_item_id) ?? { units: 0, revenue: 0 };
    entry.units += 1;
    entry.revenue += sale.price_charged;
    salesByItem.set(sale.catalog_item_id, entry);
  }

  // Books where this author is only listed via a catalog item's own
  // contact info (migration 0051) — never went through a submission, so
  // they don't show up in the section above. Explicit email filter, not
  // just RLS, for the same admin-"viewing-as" reason noted above.
  const { data: catalogBooks } = email
    ? await supabase
        .from("catalog_items")
        .select("id, title, price, item_type")
        .ilike("author_email", email)
    : { data: [] };

  const catalogBookIds = (catalogBooks ?? []).map((b) => b.id);
  const { data: catalogSales } =
    catalogBookIds.length > 0
      ? await supabase
          .from("sales")
          .select("catalog_item_id, price_charged")
          .in("catalog_item_id", catalogBookIds)
          .eq("status", "completed")
      : { data: [] };

  const catalogSalesByItem = new Map<string, { units: number; revenue: number }>();
  for (const sale of catalogSales ?? []) {
    const entry = catalogSalesByItem.get(sale.catalog_item_id) ?? { units: 0, revenue: 0 };
    entry.units += 1;
    entry.revenue += sale.price_charged;
    catalogSalesByItem.set(sale.catalog_item_id, entry);
  }

  // Same RPC the real public page uses (author_public_books, migration
  // 0069) — powers this preview too, so it always shows exactly what
  // /authors/<id> will render. Deliberately not gated by whether this
  // author currently qualifies for public listing (unlike
  // author_public_profile()), so the preview works even before their
  // first book is approved.
  const { data: publicBooks } = await supabase.rpc("author_public_books", {
    p_author_user_id: authorUserId,
  });

  const hasPublicBooks =
    (submissions ?? []).some((s) => s.status === "approved" && s.catalog_item_id !== null) ||
    (catalogBooks ?? []).length > 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Welcome, ${name} 👋`}
        description="Everything you've submitted, its review status, and — once approved — how it's selling."
      />

      <Card className="max-w-lg">
        <h2 className="font-heading font-bold text-neutral-900">Your public profile</h2>
        <p className="mb-3 text-xs text-neutral-500">
          Shown on your public author page, linked from the &quot;Meet the authors&quot; section
          of the homepage once you have at least one approved book.
        </p>
        <AuthorProfileForm initialBio={bio} initialWebsite={website} />
        {hasPublicBooks && (
          <Link
            href={`/authors/${authorUserId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-block text-sm font-semibold text-accent-600 hover:underline"
          >
            View your live public page →
          </Link>
        )}
      </Card>

      <div>
        <h2 className="font-heading text-lg font-bold text-neutral-900">
          Preview: how your public page looks
        </h2>
        <p className="mb-4 text-xs text-neutral-500">
          Reflects your saved bio/website above — save changes to update it here.
        </p>
        <Card className="max-w-3xl">
          <AuthorPublicProfile
            name={name}
            bio={bio}
            website={website}
            books={(publicBooks ?? []) as PublicBook[]}
          />
        </Card>
      </div>

      <div className="flex flex-col gap-4">
        {(submissions ?? []).map((s) => {
          const sold = s.catalog_item_id ? salesByItem.get(s.catalog_item_id) : undefined;
          return (
            <Card key={s.id} className="max-w-lg">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-heading font-bold text-neutral-900">{s.title}</h3>
                  <p className="text-sm text-neutral-600">
                    Retail ${s.suggested_retail_price.toFixed(2)} — you earn $
                    {s.wholesale_price.toFixed(2)}/unit
                  </p>
                </div>
                <Badge tone={statusTone(s.status)}>{s.status}</Badge>
              </div>
              {s.status === "declined" && s.admin_note && (
                <p className="mt-2 text-sm text-neutral-600">Reason: {s.admin_note}</p>
              )}
              {s.status === "approved" && (
                <p className="mt-2 text-sm text-neutral-700">
                  {sold
                    ? `${sold.units} sold so far — $${sold.revenue.toFixed(2)} earned`
                    : "On sale — nothing sold yet"}
                </p>
              )}
            </Card>
          );
        })}
        {(submissions ?? []).length === 0 && (
          <p className="text-sm text-neutral-500">
            You haven&apos;t submitted anything yet — use &quot;Submit new item&quot; above.
          </p>
        )}
      </div>

      {catalogBooks && catalogBooks.length > 0 && (
        <div className="flex flex-col gap-4">
          <h2 className="font-heading text-lg font-bold text-neutral-900">
            Books you&apos;re listed as the author for
          </h2>
          {catalogBooks.map((book) => {
            const sold = catalogSalesByItem.get(book.id);
            return (
              <Card key={book.id} className="max-w-lg">
                <h3 className="font-heading font-bold text-neutral-900">{book.title}</h3>
                <p className="text-sm text-neutral-600">Retail ${book.price.toFixed(2)}</p>
                <p className="mt-2 text-sm text-neutral-700">
                  {sold
                    ? `${sold.units} sold so far — $${sold.revenue.toFixed(2)}`
                    : "On sale — nothing sold yet"}
                </p>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
