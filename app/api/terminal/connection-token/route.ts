import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";

// Called by the Terminal JS SDK's onFetchConnectionToken callback, from
// browser JS rather than page navigation — so unlike requireAdmin() (which
// redirects), an unauthorized caller here gets a plain 401/403 JSON
// response, which is what fetch() callers can actually act on.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: adminRow } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!adminRow) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const connectionToken = await getStripe().terminal.connectionTokens.create();
  return NextResponse.json({ secret: connectionToken.secret });
}
