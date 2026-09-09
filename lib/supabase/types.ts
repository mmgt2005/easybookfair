/**
 * Placeholder until real types are generated from the running database:
 *   npx supabase gen types typescript --local > lib/supabase/types.ts
 * Do that once `supabase/migrations` has been applied to a project, then
 * replace this file — don't hand-maintain table types alongside SQL.
 */
export type Database = Record<string, never>;
