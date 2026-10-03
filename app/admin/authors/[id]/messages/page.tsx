import { createClient } from "@/lib/supabase/server";
import { getAuthorMessages } from "../../messagesActions";
import { AuthorMessagesClient } from "@/components/AuthorMessagesClient";
import { Card, PageHeader } from "@/components/ui";

export default async function AuthorMessagesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: authorUserId } = await params;
  const supabase = await createClient();

  const { data: author } = await supabase
    .from("authors")
    .select("name")
    .eq("user_id", authorUserId)
    .single();

  if (!author) {
    return <p className="text-sm text-red-600">Author not found.</p>;
  }

  const initialMessages = await getAuthorMessages(authorUserId);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={`Messages — ${author.name} 💬`} backHref="/admin/authors" />
      <Card className="max-w-lg">
        <AuthorMessagesClient
          authorUserId={authorUserId}
          viewerRole="admin"
          initialMessages={initialMessages}
        />
      </Card>
    </div>
  );
}
