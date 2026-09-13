"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Public — no login required, same trust model as
// app/author/submit/actions.ts: anyone can submit, an admin reviews every
// row before it becomes a real organization.
export async function submitOrgSignup(formData: FormData) {
  const supabase = await createClient();

  const orgName = String(formData.get("org_name") ?? "").trim();
  const contactName = String(formData.get("contact_name") ?? "").trim();
  const contactEmail = String(formData.get("contact_email") ?? "").trim();
  const isSchool = formData.get("is_school") === "on";
  const message = String(formData.get("message") ?? "").trim() || null;

  if (!orgName || !contactName || !contactEmail) {
    redirect(
      `/join?error=${encodeURIComponent("Organization name, contact name, and contact email are required")}`,
    );
  }

  const { error } = await supabase.from("org_signups").insert({
    org_name: orgName,
    contact_name: contactName,
    contact_email: contactEmail,
    is_school: isSchool,
    message,
  });

  if (error) {
    redirect(`/join?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/join?success=1");
}
