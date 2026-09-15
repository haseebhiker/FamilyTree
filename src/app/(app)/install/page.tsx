import { Card } from "@/components/ui";

function ShareIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="mr-1 inline h-4 w-4 -translate-y-0.5">
      <path d="M10 2a1 1 0 0 1 1 1v8.59l2.3-2.3a1 1 0 1 1 1.4 1.42l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.42l2.3 2.3V3a1 1 0 0 1 1-1Z" />
      <path d="M4 11a1 1 0 0 1 1 1v3a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-3a1 1 0 1 1 2 0v3a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-3a1 1 0 0 1 1-1Z" />
    </svg>
  );
}

function MenuDotsIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="mr-1 inline h-4 w-4 -translate-y-0.5">
      <circle cx="10" cy="4" r="1.6" />
      <circle cx="10" cy="10" r="1.6" />
      <circle cx="10" cy="16" r="1.6" />
    </svg>
  );
}

function Steps({ children }: { children: React.ReactNode }) {
  return <ol className="ml-5 list-decimal space-y-2 text-sm text-slate-700">{children}</ol>;
}

export default function InstallHelpPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Install as an app</h1>
        <p className="mt-1 text-sm text-slate-500">
          Add the family tree to your home screen so it opens like a regular app — one tap, no browser bar, works
          the same as any other app icon on your phone.
        </p>
      </div>

      <Card>
        <h2 className="mb-3 text-base font-semibold text-slate-900">iPhone / iPad</h2>
        <Steps>
          <li>Open this site in <strong>Safari</strong> or <strong>Chrome</strong></li>
          <li>
            Tap the <ShareIcon />
            <strong>Share</strong> button — the square with an arrow pointing up, at the bottom of the screen (in
            Safari) or top of the screen (in Chrome)
          </li>
          <li>Scroll down the menu that pops up and tap <strong>&quot;Add to Home Screen&quot;</strong></li>
          <li>Tap <strong>&quot;Add&quot;</strong> in the top-right corner</li>
        </Steps>
        <p className="mt-3 text-sm text-slate-500">
          Done — the family tree icon now sits on your home screen like any other app.
        </p>
      </Card>

      <Card>
        <h2 className="mb-3 text-base font-semibold text-slate-900">Android (Chrome)</h2>
        <Steps>
          <li>Open this site in the <strong>Chrome</strong> app</li>
          <li>
            Tap the <MenuDotsIcon />
            <strong>three-dot menu</strong> in the top-right corner
          </li>
          <li>
            Tap <strong>&quot;Add to Home screen&quot;</strong> or <strong>&quot;Install app&quot;</strong> (the
            wording varies slightly by phone)
          </li>
          <li>Tap <strong>&quot;Install&quot;</strong> or <strong>&quot;Add&quot;</strong> to confirm</li>
        </Steps>
        <p className="mt-3 text-sm text-slate-500">
          Some Android phones will also just show a banner at the bottom asking &quot;Add Family Tree to Home
          screen?&quot; — tap that if you see it, it&apos;s the same thing.
        </p>
      </Card>

      <p className="text-xs text-slate-400">
        Either way, this doesn&apos;t download anything from an app store — it&apos;s the same site, just with a
        shortcut icon so you don&apos;t have to type the address or dig through your browser to get back here.
      </p>
    </div>
  );
}
