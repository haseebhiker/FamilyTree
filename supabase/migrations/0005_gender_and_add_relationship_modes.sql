-- 1. An explicit, optional gender field. Never backfilled/inferred here —
-- the app already infers a display gender from father_id/mother_id
-- placement as a fallback, so this only needs to cover the cases that
-- fallback can't: anyone without their own recorded children (most
-- leaves, most spouses).
alter table people add column gender text check (gender in ('M', 'F'));

-- 2. Nothing else needed schema-side for the redesigned "Add a family
-- member" flow — sibling-linking and spouse-linking both reuse the
-- existing add_relationship / add_person pending-change types with a
-- new `mode` key in proposed_data (application-level only, no new
-- change_type value, so no constraint change required here).
