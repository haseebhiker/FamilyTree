import { Card } from "@/components/ui";

export default function DataExportPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Data Export</h1>

      <Card>
        <h2 className="mb-1 text-sm font-semibold text-slate-900">Backup of data</h2>
        <p className="mb-3 text-sm text-slate-500">
          Every table, unredacted (people, relationships, contact details, invites, members, pending changes, audit
          log) as one JSON file. Keep it somewhere private — it includes everything, not just what&apos;s public.
        </p>
        <a
          href="/admin/export/backup"
          className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Download full backup (.json)
        </a>
      </Card>

      <Card>
        <h2 className="mb-1 text-sm font-semibold text-slate-900">Offline tree view</h2>
        <p className="mb-3 text-sm text-slate-500">
          A zip with one self-contained HTML file — unzip and open it in any browser, no internet or server needed.
          Browsable and searchable, same as the live tree. Contact details and anything set to admins-only/just-me
          are left out, since this file is no longer protected by sign-in once it leaves the app.
        </p>
        <a
          href="/admin/export/offline-tree"
          className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Download offline tree (.zip)
        </a>
      </Card>
    </div>
  );
}
