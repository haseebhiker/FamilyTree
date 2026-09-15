import { Card } from "@/components/ui";

export default function AboutPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900">About This Family Tree</h1>
      <Card>
        <div className="space-y-3 text-sm leading-relaxed text-slate-700">
          <p>
            This family tree started more than 20 years ago. It&apos;s me, Haseeb Anna, with a lot of help from
            Sajjad — we interviewed many people over the years, primarily the elders in our family, to piece
            together as much of our shared history as we could.
          </p>
          <p>
            What began as those conversations has grown into this app, now holding over a thousand people across
            generations. It&apos;s a labor of love, and it&apos;s still growing — if you notice something missing
            or wrong, use &quot;Suggest an edit&quot; on that person&apos;s profile. Every contribution builds on
            the same effort those first conversations started.
          </p>
        </div>
      </Card>
    </div>
  );
}
