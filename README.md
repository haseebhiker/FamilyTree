# Family Tree App

A private, invite-only family tree for the Nambadavangal family — replaces the old static site with a browsable tree that members can view and propose edits to, subject to admin approval. See `family-tree-app-requirements.md` for the full spec.

## Stack
- [Next.js](https://nextjs.org) 16 (App Router, TypeScript, Tailwind CSS)
- [Supabase](https://supabase.com) for the database, Google auth, and RLS-enforced permissions
- Hosted free on [Vercel](https://vercel.com)

## One-time setup

### 1. Create a Supabase project
1. Go to [supabase.com](https://supabase.com) → New Project.
2. **Settings → API** → copy the **Project URL** and **anon public key** into `.env.local` (see below).
3. **SQL Editor** → paste in the contents of `supabase/schema.sql` and run it. This creates every table, RLS policy, and seeds:
   - The privacy defaults from design doc §5.
   - A `super_admin` invite for `haseebm@gmail.com` — edit that email in the SQL before running it if you want a different first Super Admin.

### 2. Set up Google sign-in
1. In [Google Cloud Console](https://console.cloud.google.com), create a new project (e.g. "Family Tree App").
2. **APIs & Services → OAuth consent screen** (now under "Google Auth Platform") — External users, add your family's emails as test users while it's in testing mode.
3. **Clients → Create Credentials → OAuth client ID** (Web application).
   - Authorized JavaScript origins: `http://localhost:3000` (add your Vercel URL and custom domain later).
4. In Supabase: **Authentication → Providers → Google** — paste in the Client ID/Secret, copy the **Callback URL** it shows you.
5. Back in Google Cloud Console, paste that callback URL into the OAuth client's **Authorized redirect URIs**.
6. In Supabase: **Authentication → URL Configuration → Redirect URLs** — add `http://localhost:3000/auth/callback` (and your production URL + `/auth/callback` later).

### 3. Import the legacy family tree
The old site's Legacy Family Tree 3.0 export has already been parsed into `supabase/legacy-data/people.json` and `spouses.json` (1,048 people, 1,595 parent-child links, 343 marriages — see `validation-report.txt` for 16 likely-duplicate names to review after import, via **People Management → Merge duplicate profiles**).

1. Get the **service_role** key from Supabase (Settings → API — keep this out of Vercel, it bypasses every permission check).
2. Add it to `.env.local` as `SUPABASE_SERVICE_ROLE_KEY`.
3. Run:
   ```bash
   node scripts/migrate-to-supabase.mjs
   ```
   This is safe to run only once — it refuses to run again if `people` already has rows.

If you ever need to re-parse from a fresh export of the old site, `node scripts/parse-legacy-tree.mjs <path-to-OURFAMILY-folder>` regenerates the three files in `supabase/legacy-data/`.

## Local development
1. `cp .env.local.example .env.local` and fill in everything from the steps above.
2. `npm install`
3. `npm run dev` — the app runs at http://localhost:3000
4. Sign in with the Super Admin's Google account — you're in immediately (no separate onboarding step).

## Deploying
Push to GitHub, connect the repo in Vercel, add `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` there (**never** the service role key), and it auto-deploys on every push to `main`. Add the production URL to both the Google OAuth client's origins and Supabase's redirect URLs.

## What's built vs. what's stubbed
**Built:** Google sign-in gated by an invite list with roles (member/admin/super admin), the propose → admin-approve edit workflow with a diff view and full audit log, per-field privacy settings, multi-entry contact details (several phones/emails/addresses per person, each with its own visibility), preferred name, Invite/People/Audit-Log/Privacy-Defaults/Data-Export admin screens, and the legacy data migration.

**Data Export** (Admin → Data Export): a one-click full JSON backup of every table (unredacted — admin-only, meant for disaster recovery), and a one-click zip containing a single self-contained offline HTML file of the tree (works with no server, same collapsible/search UI as the live tree) — that one's redacted as if viewed by a plain member, since contact details and admins-only/just-me fields shouldn't leave the app in a file that could get passed around.

**Simplified for v1, flagged for follow-up:**
- **Tree view** is a collapsible indented list with search-to-profile, not yet a full pan/zoom node-graph canvas (design doc §8). Functionally complete (expand/collapse, click into a profile, jump via search) but not the visual graph layout — worth a follow-up pass with a library like React Flow if that visual style matters.
- **Photo upload** isn't wired up yet — the profile edit form only takes a photo URL. Should go browser → Supabase Storage directly rather than through a Server Action (Vercel's 4.5MB request body cap), same pattern as Condo App.
- **Email notifications** (Resend, design doc §11.4) are stubbed as no-ops in `src/lib/actions/pending-changes.ts` — everything else works without them (in-app status is always visible on My Submissions / Pending Approvals).
- **add_relationship** pending-change type exists in the schema but only `add_person`'s child/spouse/parent flows are wired up in the UI — there's no "link two existing people" form yet.
