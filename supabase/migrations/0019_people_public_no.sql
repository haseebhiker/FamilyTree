-- A short, easy-to-say number for every person (1, 2, 3 ... oldest first), so
-- two people with similar-sounding names can be told apart at a glance
-- ("Person #142"). Separate from the long internal id, which stays as is.
create sequence if not exists people_public_no_seq;

alter table people add column if not exists public_no integer;

-- Number everyone who doesn't have one yet, oldest first.
with ordered as (
  select id, row_number() over (order by created_at, id) as n
  from people
  where public_no is null
)
update people p set public_no = o.n from ordered o where p.id = o.id;

select setval('people_public_no_seq', greatest((select coalesce(max(public_no), 0) from people), 1));

alter table people alter column public_no set default nextval('people_public_no_seq');
alter table people alter column public_no set not null;
create unique index if not exists people_public_no_key on people (public_no);
