import { createClient } from "@/lib/supabase/server";
import { updateAuthor } from "../../actions";
import { Button, Card, Field, Input, PageHeader } from "@/components/ui";

export default async function EditAuthorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: author, error } = await supabase
    .from("authors")
    .select("user_id, name, email, phone")
    .eq("user_id", id)
    .single();

  if (error || !author) {
    return <p className="text-sm text-red-600">Author not found.</p>;
  }

  const updateAuthorForAuthor = updateAuthor.bind(null, author.user_id);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Edit author 🖋️" backHref="/admin/authors" />

      <Card className="max-w-sm">
        <form action={updateAuthorForAuthor} className="flex flex-col gap-3">
          <Field label="Name">
            <Input name="name" required defaultValue={author.name} />
          </Field>
          <Field
            label="Email"
            hint="Doesn't change their login — that's a separate Supabase Auth account. Does change which catalog items their portal matches by author_email."
          >
            <Input name="email" type="email" required defaultValue={author.email} />
          </Field>
          <Field label="Phone">
            <Input name="phone" type="tel" defaultValue={author.phone ?? ""} />
          </Field>
          <Button type="submit">Save changes</Button>
        </form>
      </Card>
    </div>
  );
}
