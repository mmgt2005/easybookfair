"use client";

// Toggles every checkbox associated with the given form id (via each
// checkbox's own `form="..."` attribute, not DOM nesting — review-queue
// checkboxes live inside each row's own Card, not inside the bulk
// <form> itself, since a per-row Card already has its own single-item
// approve/decline <form> and HTML forbids nested forms). No state is
// held here; it's a pure DOM toggle, so it stays correct even as rows
// are added/removed across re-renders.
export function SelectAllCheckbox({ formId }: { formId: string }) {
  return (
    <input
      type="checkbox"
      aria-label="Select all"
      onChange={(e) => {
        document
          .getElementById(formId)
          ?.querySelectorAll<HTMLInputElement>('input[name="ids"]')
          .forEach((checkbox) => {
            checkbox.checked = e.target.checked;
          });
      }}
    />
  );
}
