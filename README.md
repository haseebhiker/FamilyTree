# Family Tree App

A private, invite-only family tree for the Nambadavangal family — replaces the old static site with a browsable tree that members can view and propose edits to, subject to admin approval. See `family-tree-app-requirements.md` for the original spec (the app has since grown past it — groups, encryption, partial dates, and the self-service access-request flow below aren't in that doc).

## Stack
- [Next.js](https://nextjs.org) 16 (App Router, TypeScript, Tailwind CSS)
- [Supabase](https://supabase.com) for the database, Google auth, and RLS-enforced permissions
- Hosted free on [Vercel](https://vercel.com)

## One-time setup

### 1. Create a Supabase project
1. Go to [supabase.com](https://supabase.com) → New Project.
2. **Settings → API** → copy the **Project URL** and **anon public key** into `.env.local` (see below).
3. **SQL Editor** → paste in the contents of `supabase/schema.sql` and run it. This creates every table, RLS policy, and seeds:
   - The privacy defaults (only name and current location are visible to everyone by default — see "Privacy model" below).
   - A `super_admin` invite for `haseebm@gmail.com` — edit that email in the SQL before running it if you want a different first Super Admin.

### 2. Set up Google sign-in
1. In [Google Cloud Console](https://console.cloud.google.com), create a new project (e.g. "Family Tree App").
2. **APIs & Services → OAuth consent screen** (now under "Google Auth Platform") — External users, add your family's emails as test users while it's in testing mode.
3. **Clients → Create Credentials → OAuth client ID** (Web application).
   - Authorized JavaScript origins: `http://localhost:3000` (add your Vercel URL and custom domain later).
4. In Supabase: **Authentication → Providers → Google** — paste in the Client ID/Secret, copy the **Callback URL** it shows you.
5. Back in Google Cloud Console, paste that callback URL into the OAuth client's **Authorized redirect URIs**.
6. In Supabase: **Authentication → URL Configuration → Redirect URLs** — add `http://localhost:3000/auth/callback` (and your production URL + `/auth/callback` later).

### 3. Generate the contact-info encryption key
Phone/email/address entries are encrypted at the app layer (AES-256-GCM) before they ever reach Supabase — same pattern as Trip App's vault. Run once and save the output:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```
Put it in `.env.local` **and** in Vercel's env vars (unlike the service role key below, the live app needs this on every request). Losing it permanently locks everyone out of their own contact details, so back it up somewhere safe.

### 4. Import the legacy family tree
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
Push to GitHub, connect the repo in Vercel, add `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `VAULT_ENCRYPTION_KEY` there (**never** the service role key), and it auto-deploys on every push to `main`. Add the production URL to both the Google OAuth client's origins and Supabase's redirect URLs.

## Privacy model
Only a person's **name and current location (city/country)** are visible to everyone by default. Everything else — birthday, death date, place of birth/death, social links, and every phone/email/address entry — is private until the profile's owner opts in, either to everyone in the app or to specific groups they belong to (a profile's **Privacy settings** section, and the visibility picker on each contact entry). An admin sets the fallback for profiles nobody's claimed yet (**Admin → Privacy Defaults**), defaulting to admins-only. Contact details are also encrypted at rest (see step 3 above) — the "About" section on every profile spells this out for members.

## Groups
Anyone can create a private group (becoming its admin, able to add people directly); only an app admin can create a public one. Joining any group — public or private — needs that group's admin (or an app admin) to approve, unless the admin adds you directly. A person can belong to as many groups as they like, and can restrict any piece of their info to one or more specific groups instead of "everyone." Manage groups from the **Groups** nav link.

## Getting in without an invite
An authenticated Google account that isn't on the invite list lands on a form instead of a dead end (`/not-authorized`) — name, how they're related to the family, and open notes. Admins review these under **Admin → Access Requests**; approving one creates a normal invite, and the requester's already-open session picks it up on their next page load (no need to sign in again).

## What's built vs. what's stubbed
**Built:** Google sign-in gated by an invite list with roles (member/admin/super admin) plus a self-service access-request flow for uninvited accounts; the propose → admin-approve edit workflow with a diff view and full audit log; per-field privacy settings with an "everyone / specific groups / admins only / just me" choice; groups (public/private, join-approval, direct-add); encrypted, multi-entry contact details (several phones/emails/addresses per person) with WhatsApp/call/mailto quick-action icons and mandatory country codes so numbers are always E.164; partial birth/death dates (year-only, month+day with no year, etc.); preferred name; Invite/People/Audit-Log/Privacy-Defaults/Access-Requests/Data-Export admin screens; and the legacy data migration.

**Data Export** (Admin → Data Export): a one-click full JSON backup of every table (unredacted, still holding encrypted contact values as ciphertext — admin-only, meant for disaster recovery), and a one-click zip containing a single self-contained offline HTML file of the tree (works with no server, same collapsible/search UI as the live tree) — that one's redacted as if viewed by a plain member with no group memberships, since contact details and anything not shared with "everyone" shouldn't leave the app in a file that could get passed around.

**Simplified for v1, flagged for follow-up:**
- **Tree view** is a collapsible indented list with search-to-profile, not yet a full pan/zoom node-graph canvas. Functionally complete (expand/collapse, click into a profile, jump via search) but not the visual graph layout — worth a follow-up pass with a library like React Flow if that visual style matters.
- **Photo upload** isn't wired up yet — the profile edit form only takes a photo URL. Should go browser → Supabase Storage directly rather than through a Server Action (Vercel's 4.5MB request body cap), same pattern as Condo App.
- **Email notifications** (Resend) are stubbed as no-ops in `src/lib/actions/pending-changes.ts` — everything else works without them (in-app status is always visible on My Submissions / Pending Approvals / Access Requests).
- **add_relationship** pending-change type exists in the schema but only `add_person`'s child/spouse/parent flows are wired up in the UI — there's no "link two existing people" form yet.
- The country list in `src/lib/countries.ts` covers ~55 common countries, not all ~195 — easy to extend, just didn't type out every one.
