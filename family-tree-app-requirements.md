# Family Tree Web App — Requirements Document

## 1. Project Summary
A private, invite-only web application that replaces the old static "Nambavargal" genealogy site with a modern, interactive family tree that family members can browse, and propose edits/additions to, subject to admin approval.

**Seed data:** The existing Legacy Family Tree export (1,048 individuals, ~1,595 parent-child links, 680 people with recorded spouses, rooted at Aidroos /MOHIDEEN/) will be migrated in as the starting dataset.

---

## 2. Users & Roles

| Role | Description |
|---|---|
| **Super Admin** | You. Full control: manage the invite list, approve/reject all edits, manage other admins, hard-delete records, view everything regardless of privacy settings. |
| **Admin** | Trusted family member(s) you designate. Same approval powers as Super Admin, but cannot manage other admins or remove the Super Admin. |
| **Member** | Any invited family member. Can browse the tree, view profiles (subject to privacy settings), and submit proposed edits/additions — nothing they submit goes live until approved. |

**Access model:** Invite-only. There is no public sign-up. An admin adds a person's Gmail address to the invite list (with the person's name and their linked tree profile, if they already exist in the data). That person can then sign in with Google; anyone not on the list is denied at login.

---

## 3. Authentication
- **Google OAuth (Sign in with Google)** — no separate passwords to manage.
- On login, the app checks the authenticated email against the invite list.
  - Not on the list → friendly "not authorized, contact admin" screen.
  - On the list, first login → account is created and linked to their invite record (and to their existing tree profile, if one was specified).
- Admins can revoke access (remove from invite list) at any time; this immediately blocks further logins but does not delete their historical edit submissions.

---

## 4. Data Model (extending the current dataset)

### Person record — existing fields (from migrated data)
- Unique ID
- Full name (+ any "other names"/nicknames)
- Surname/family tag (e.g. `/MOHIDEEN/`)
- Father (link), Mother (link)
- Spouse(s) (link, supports multiple)
- Children (link, per spouse)
- Marriage notes (free text, where present)

### New fields to add
- Date of birth (allow partial/unknown dates, e.g. "circa 1950" or year-only)
- Date of death (same flexibility; blank = presumed living)
- Living status (Living / Deceased / Unknown) — drives default privacy behavior
- Place of birth
- Place of death
- Current location / city (for living members)
- Profile photo (upload or URL)
- Short bio / notes (free text)
- Facebook profile URL
- LinkedIn profile URL
- Email (optional, separate from login email — for members not yet on the platform)
- Phone (optional)
- **Field-level privacy setting** (see §5) for each sensitive field

### Relationship integrity rules
- A person can have 0–2 parents, 0–many spouses, 0–many children per spouse.
- Prevent orphaned/contradictory links (e.g., listing someone as their own ancestor) — validate on save.

---

## 5. Privacy Model
**Rule:** For each of the sensitive fields (DOB, phone, email, current location, Facebook/LinkedIn links, place of birth/death for living people), **the profile's owner controls visibility**, with these defaults and guardrails:
- Default for a newly added/claimed profile: visible to **logged-in family members only** (never public).
- The profile owner (the member account linked to that person) can, per field, set: *Everyone in the family app* / *Admins only* / *Just me*.
- If a profile has no linked member account yet (e.g., a deceased ancestor or a relative who hasn't joined), an **admin sets the default visibility**, defaulting to "family members only" for name/relationships and "admins only" for anything that feels sensitive (contact info) until a real member claims that profile.
- Deceased individuals: privacy toggles are still respected as last set, but admins can adjust since there's no living owner to manage them.
- Core identity/relationship fields (name, parents, spouse, children, living status) are always visible to all logged-in members — privacy controls only apply to the added contact/personal fields, not the tree structure itself.

---

## 6. Edit & Approval Workflow
This is the core safety mechanism you asked for — **nothing changes live without admin sign-off.**

1. A member finds a profile (their own or a relative's) and clicks "Suggest an edit" or "Add a family member."
2. They fill out a change form (add/edit fields, add a new child/spouse/parent link, etc.).
3. The submission goes into a **Pending Changes queue**, visible only in the Admin menu. The member sees a "submitted, awaiting approval" confirmation and can see the status of their own past submissions (Pending / Approved / Rejected).
4. An admin reviews each pending change in a **diff view** (old value vs. proposed value, side by side) and can:
   - **Approve** → change is applied live immediately, and an entry is added to the audit log.
   - **Reject** → change is discarded; optionally the admin leaves a note ("please provide a source" etc.), visible to the submitter.
   - **Edit-then-approve** → admin can tweak the submitted values before approving (e.g., fix a typo) rather than rejecting outright.
5. **Members can never directly edit or delete live data.** Only approved changes, applied by an admin action (or auto-applied if the actor is an admin/super admin), touch the live tree.
6. **Deletions are admin-only** and require a confirmation step (type the person's name to confirm) — regular members can only *propose* a removal/correction, never execute one.
7. **Full audit log**: every applied change records who submitted it, who approved it, and when — visible to admins, with a simplified "history" tab visible on each profile page (e.g., "Added by Zainab on Jan 3, 2027").

---

## 7. Admin Menu (separate from the main browsing UI)
- **Pending Approvals** — queue described above, with counts/notifications.
- **Invite Management** — add/remove invited emails, assign role (Member/Admin), see who has/hasn't logged in yet, link an invite to an existing tree profile.
- **People Management** — full record list with search, ability to merge duplicate profiles, hard-delete (with confirmation + reason logged).
- **Audit Log** — full searchable history of all changes across the tree.
- **Privacy Defaults** — set the fallback visibility rules for unclaimed profiles.

---

## 8. Tree Visualization
- **Interactive expandable tree diagram**: pan and zoom around the tree; each person is a node showing name + photo thumbnail (if available) + lifespan (e.g., "1920–1995" or "b. 1990").
- Nodes for people with hidden children/ancestors are **collapsed by default** with a click-to-expand indicator, so the initial view isn't overwhelming (given 1,000+ people).
- Clicking a node opens a **profile panel** (side drawer or modal) with full details (respecting privacy settings for the viewer) and the "Suggest an edit" action.
- **Search bar** to jump straight to a person by name and re-center the tree on them.
- Ability to view a person's **direct pedigree** (ancestors only, like the old site) or their **descendants**, as filtered views, in addition to the full interactive graph.
- Mobile-responsive: usable (even if a bit more scroll/zoom-heavy) on a phone screen, since family members will likely check this from their phones.

---

## 9. Data Migration
- One-time import script to convert the parsed legacy data (names, parent/child links, spouses) into the new data model.
- Since the legacy export has no dates/locations, all new fields start blank and get filled in over time via the edit-approval workflow.
- After import, run a validation pass to flag: broken links, likely duplicate individuals, and people with inconsistent parent/spouse data — surfaced to the admin for cleanup before go-live.

---

## 10. Non-Functional Requirements
- **Private by default**: no public/anonymous access at all; entire app sits behind Google login + invite check.
- **Mobile-responsive** UI.
- **Backups**: automatic regular backups of the database (given this is irreplaceable family history).
- Reasonable performance with ~1,000–2,000 person records (should not require special scaling work).

---

## 11. Decisions (finalized — best judgment applied)
1. **Hosting/stack**: Next.js (React) app deployed on Vercel, with a managed Postgres database (e.g., Neon or Supabase — both have generous free tiers suitable for this scale). Prisma as the ORM. This keeps hosting simple and low-maintenance with no servers to manage.
2. **Photos**: support direct upload (stored via a simple blob/object storage service — e.g., Vercel Blob or an S3-compatible bucket), with a paste-a-URL option as a fallback. Uploads give a much better experience for non-technical family members than requiring them to host images elsewhere.
3. **Admins**: you are seeded as the initial Super Admin at setup. Additional admins are added later through the Invite Management screen (no other admins are hardcoded now — this stays flexible).
4. **Notifications**: include basic transactional email (via a simple provider like Resend) for two events — (a) admin(s) notified when a new edit is pending, (b) submitter notified when their edit is approved or rejected. In-app status is always visible too; email is just a nudge.
5. **Old site**: leave the existing static site up as a read-only archive for now (link to it from the new app's footer as "original archive"), rather than taking it down or redirecting. Revisit once the new app is stable.
6. **Language/script**: no special RTL or non-Latin script support needed — existing names are already Latin-transliterated, and new entries will follow the same convention. Standard Unicode text fields are sufficient.

---

**Status: finalized.** This document is ready to hand to Claude Code as the build spec.
