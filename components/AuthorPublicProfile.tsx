import { Card } from "@/components/ui";

type AuthorBook = {
  catalog_item_id: string;
  title: string;
  description: string | null;
  image_url: string | null;
};

// Shared by the real public page (app/authors/[authorId]/page.tsx) and
// the author dashboard's own "preview my public page" section
// (app/author/(portal)/page.tsx) — one component means the preview
// always shows exactly what the live page will look like, nothing to
// keep in sync between two separate renderings.
export function AuthorPublicProfile({
  name,
  bio,
  website,
  books,
}: {
  name: string;
  bio: string | null;
  website: string | null;
  books: AuthorBook[];
}) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-neutral-900">{name}</h1>
        {bio && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-neutral-700">{bio}</p>}
        {website && (
          <a
            href={website}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-sm font-semibold text-accent-600 hover:underline"
          >
            🔗 {website}
          </a>
        )}
      </div>

      {books.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {books.map((book) => (
            <Card key={book.catalog_item_id} className="flex flex-col gap-2">
              {book.image_url && (
                <img
                  src={book.image_url}
                  alt={book.title}
                  className="aspect-[2/3] w-full rounded-lg object-cover"
                />
              )}
              <h3 className="font-heading font-bold text-neutral-900">{book.title}</h3>
              {book.description && (
                <p className="line-clamp-4 text-sm text-neutral-600">{book.description}</p>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <p className="text-sm text-neutral-500">No books listed yet.</p>
      )}
    </div>
  );
}
