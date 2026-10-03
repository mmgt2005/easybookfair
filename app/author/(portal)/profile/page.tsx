import Link from "next/link";
import { requireAuthor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader } from "@/components/ui";
import { AuthorPublicProfile } from "@/components/AuthorPublicProfile";
import { AuthorProfileForm } from "./AuthorProfileForm";

type BookReview = {
  reviewer_name: string;
  rating: number;
  review_text: string | null;
  created_at: string;
};

type PublicBook = {
  catalog_item_id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  reviews: BookReview[];
};

// Its own nav page, mirroring "Submit new item" (app/author/submit) —
// previously this lived inline at the top of the dashboard
// (app/author/(portal)/page.tsx).
export default async function AuthorProfilePage() {
  const { name, authorUserId, bio, website } = await requireAuthor();
  const supabase = await createClient();

  // author_public_profile() (migration 0069) already encodes the exact
  // "does this author qualify for public listing" check (a real account +
  // at least one approved book) — reusing it here instead of re-deriving
  // the same logic from author_submissions/catalog_items a second time.
  const [{ data: publicProfile }, { data: publicBooks }] = await Promise.all([
    supabase.rpc("author_public_profile", { p_author_user_id: authorUserId }).maybeSingle(),
    supabase.rpc("author_public_books", { p_author_user_id: authorUserId }),
  ]);

  const hasPublicBooks = !!publicProfile;

  const booksWithReviews = await Promise.all(
    ((publicBooks ?? []) as Omit<PublicBook, "reviews">[]).map(async (book) => {
      const { data: reviews } = await supabase.rpc("book_reviews_public", {
        p_catalog_item_id: book.catalog_item_id,
      });
      return { ...book, reviews: (reviews ?? []) as BookReview[] };
    }),
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Your public profile"
        description={
          'Shown on your public author page, linked from the "Meet the authors" section of the homepage once you have at least one approved book.'
        }
        backHref="/author"
      />

      <Card className="max-w-lg">
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
            books={booksWithReviews}
          />
        </Card>
      </div>
    </div>
  );
}
