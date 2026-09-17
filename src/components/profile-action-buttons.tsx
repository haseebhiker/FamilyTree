"use client";

import { useState, type ReactNode } from "react";

type Section = "contact" | "edit" | "family";

/**
 * Three actions that used to be full-width accordion bars stacked on top
 * of each other, permanently taking up space (and pushing Family/Ancestors
 * further down the page) even collapsed. Now a compact row of buttons —
 * each server-rendered form is passed in as a prop rather than this
 * component knowing anything about them, so the expanded content renders
 * full-width below the row instead of being squeezed into one narrow
 * flex item's own width. Only one open at a time, which is also what
 * keeps this "compact" instead of three large forms all open together.
 */
export function ProfileActionButtons({
  showAddContact,
  contactForm,
  editForm,
  addFamilyMemberForm,
}: {
  showAddContact: boolean;
  contactForm: ReactNode;
  editForm: ReactNode;
  addFamilyMemberForm: ReactNode;
}) {
  const [open, setOpen] = useState<Section | null>(null);

  // Short enough that all three fit on one line even on a narrow phone —
  // the full-length labels ("Suggest an edit", "Add a family member")
  // were wide enough to force a wrap on mobile, defeating the point of a
  // compact one-line row in the first place.
  function buttonClass(key: Section) {
    return `flex-1 rounded-md border px-2 py-1 text-xs font-medium ${
      open === key
        ? "border-slate-900 bg-slate-900 text-white"
        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
    }`;
  }

  function toggle(key: Section) {
    setOpen((current) => (current === key ? null : key));
  }

  return (
    <div>
      <div className="flex gap-2">
        {showAddContact && (
          <button type="button" onClick={() => toggle("contact")} className={buttonClass("contact")}>
            Contact
          </button>
        )}
        <button type="button" onClick={() => toggle("edit")} className={buttonClass("edit")}>
          Edit
        </button>
        <button type="button" onClick={() => toggle("family")} className={buttonClass("family")}>
          Add
        </button>
      </div>
      {open && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-white">
          {open === "contact" && contactForm}
          {open === "edit" && editForm}
          {open === "family" && addFamilyMemberForm}
        </div>
      )}
    </div>
  );
}
