"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { setViewAsOrg, setViewAsAuthor, clearViewAs } from "@/lib/viewAs";

export async function startViewAsOrg(orgId: string) {
  await requireAdmin();
  await setViewAsOrg(orgId);
  redirect("/org");
}

export async function startViewAsAuthor(authorUserId: string) {
  await requireAdmin();
  await setViewAsAuthor(authorUserId);
  redirect("/author");
}

export async function stopViewAs() {
  await requireAdmin();
  await clearViewAs();
  redirect("/admin");
}
