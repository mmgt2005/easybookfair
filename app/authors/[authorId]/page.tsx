import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AuthorPublicProfile } from "@/components/AuthorPublicProfile";

type AuthorProfile = {
  author_user_id: string;
  name: string;
  bio: string | null;
  website: string | null;
};

type BookReview = {
  reviewer_name: string;
  rating: number;
  review_text: string | null;
  created_at: string;
};

type AuthorBook = {
  catalog_item_id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  reviews: BookReview[];
};

// Public, unauthenticated route — mirrors app/fairs/[fairId]/page.tsx's
// shape exactly (security-definer RPCs are the only public read path
// onto fairs/catalog_items/authors, none of which have an anon-select
// RLS policy). author_public_profile() (migration 0069) only returns a
// row once this author qualifies (a real account + at least one
// approved book) — an author who doesn't qualify (or a made-up id)
// simply gets the "not found" fallback below, same as a nonexistent fair.
export default async function AuthorPublicPage({
  params,
}: {
  params: Promise<{ authorId: string }>;
}) {
  const { authorId } = await params;
  const supabase = await createClient();

  const [{ data: profile }, { data: books }] = await Promise.all([
    supabase
      .rpc("author_public_profile", { p_author_user_id: authorId })
      .maybeSingle<AuthorProfile>(),
    supabase.rpc("author_public_books", { p_author_user_id: authorId }),
  ]);

  if (!profile) {
    return (
      <div className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-12">
        <Link href="/" className="text-sm font-semibold text-accent-600 hover:underline">
          ← Back to homepage
        </Link>
        <p className="mt-4 text-sm text-red-600">Author not found.</p>
      </div>
    );
  }

  // One book_reviews_public() call per book — no new aggregate RPC needed
  // for a single book's small review count (see migration 0073's own
  // comment on why this stays simple rather than a batched query). Done
  // after the !profile check so an unqualified/made-up author id never
  // triggers it.
  const booksWithReviews = await Promise.all(
    ((books ?? []) as Omit<AuthorBook, "reviews">[]).map(async (book) => {
      const { data: reviews } = await supabase.rpc("book_reviews_public", {
        p_catalog_item_id: book.catalog_item_id,
      });
      return { ...book, reviews: (reviews ?? []) as BookReview[] };
    }),
  );

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-12">
      <Link href="/" className="mb-4 inline-block text-sm font-semibold text-accent-600 hover:underline">
        ← Back to homepage
      </Link>
      <AuthorPublicProfile
        name={profile.name}
        bio={profile.bio}
        website={profile.website}
        books={booksWithReviews}
      />
    </div>
  );
}
