// Tiny classname joiner — no tailwind-merge conflict resolution, since the
// component library curates its own classes deliberately rather than
// letting arbitrary overrides collide with them.
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
