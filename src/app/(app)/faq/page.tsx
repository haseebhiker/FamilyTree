const FAQS: { q: string; a: string }[] = [
  {
    q: "Why does my edit need approval before it shows up?",
    a: "This family tree represents years of careful work getting the names, dates, and relationships right. To keep it accurate and trustworthy for everyone, an admin reviews each suggested change before it goes live. If you're an admin yourself, your own edits apply immediately.",
  },
  {
    q: "How do I add a parent, child, sibling, or spouse to someone's profile?",
    a: "Open that person's profile and expand \"Add a family member.\" Pick the relation from the dropdown, then either search for someone already in the tree or add a new person.",
  },
  {
    q: "I don't want my profile deleted — what happens if I ask to remove it?",
    a: "Profiles are never permanently deleted by a regular edit. An admin can mark one as removed, which hides it from browsing, but the underlying data is kept and can always be restored.",
  },
  {
    q: "Who can see my birthday, phone number, or other details?",
    a: "Nothing beyond your name and current location is shown by default. Everything else — birthday, contact info, social links — stays private until you choose to share it, either with everyone in the app or with specific groups you're in. Set this from My Privacy Settings.",
  },
  {
    q: "How do I set the name people actually call me by?",
    a: "Open your profile, expand \"Edit profile,\" and fill in \"Preferred name.\" It shows first and in bold everywhere your name appears, ahead of your full formal name.",
  },
  {
    q: "How do I install this as an app on my phone?",
    a: "See \"Install App\" in the menu for step-by-step instructions for both iPhone and Android.",
  },
];

export default function FaqPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900">Frequently Asked Questions</h1>
      <div className="space-y-2">
        {FAQS.map((item) => (
          <details key={item.q} className="rounded-lg border border-slate-200 bg-white">
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-slate-900">
              {item.q}
            </summary>
            <p className="border-t border-slate-100 px-4 py-3 text-sm text-slate-600">{item.a}</p>
          </details>
        ))}
      </div>
    </div>
  );
}
