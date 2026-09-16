-- Fallback for sorting Children/Siblings/Cousins eldest-first when the
-- exact birth year isn't known (see src/lib/sort-by-age.ts): "which child
-- they are" among their siblings (1 = firstborn, 2 = second, ...), used
-- only as a tiebreaker among people who share the same missing-year status.
alter table people add column if not exists birth_order integer;
