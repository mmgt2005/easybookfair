// A field real visitors never see or fill in; a bot that fills in every
// input on the page does. Not display:none/visibility:hidden — some bots
// specifically skip those — just zero-size, clipped, and invisible.
// Server Actions check `formData.get(name)` (default "company") and treat
// any non-empty value as spam, per lib/spamGuard.ts.
export function Honeypot({ name = "company" }: { name?: string }) {
  return (
    <div
      style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", opacity: 0 }}
      aria-hidden="true"
    >
      <label>
        Company
        <input type="text" name={name} tabIndex={-1} autoComplete="off" />
      </label>
    </div>
  );
}
