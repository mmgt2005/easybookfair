import { requireAuthor } from "@/lib/auth";
import { getAuthorMessages } from "@/app/admin/authors/messagesActions";
import { AuthorMessagesClient } from "@/components/AuthorMessagesClient";
import { Card, PageHeader } from "@/components/ui";

export default async function AuthorMessagesPage() {
  const { authorUserId, viewingAs } = await requireAuthor();

  // An admin impersonating this author has no one to message — they *are*
  // the author in this view — so the composer/thread is simply not
  // rendered rather than designing around the sender-attribution
  // ambiguity that would otherwise exist.
  if (viewingAs) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Messages 💬" />
        <p className="text-sm text-neutral-500">
          Not available while viewing as this author.
        </p>
      </div>
    );
  }

  const initialMessages = await getAuthorMessages(authorUserId);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Messages 💬"
        description="Quick conversations with the EasyBookFair admin team."
      />
      <Card className="max-w-lg">
        <AuthorMessagesClient
          authorUserId={authorUserId}
          viewerRole="author"
          initialMessages={initialMessages}
        />
      </Card>
    </div>
  );
}
