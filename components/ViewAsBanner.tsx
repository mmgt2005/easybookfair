import { stopViewAs } from "@/app/admin/view-as/actions";

// Shown at the top of /org or /author whenever an admin is "viewing as"
// that org/author (lib/viewAs.ts) — never silent, so it's always obvious
// this isn't the org/author's own real session.
export function ViewAsBanner({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-between gap-3 bg-amber-100 px-6 py-2 text-sm text-amber-900">
      <span>
        👁️ Admin mode — viewing as <strong>{label}</strong>. Actions you take here are attributed
        to this admin account, not a real login.
      </span>
      <form action={stopViewAs}>
        <button type="submit" className="font-semibold underline hover:no-underline">
          Stop viewing as
        </button>
      </form>
    </div>
  );
}
