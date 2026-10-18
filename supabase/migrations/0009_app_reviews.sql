-- Anonymous reviews of the Limitless app, sent from the Reviews page.
-- No name, account or IP address is stored. A team member reads each review; the page does
-- not show it until its status is 'approved'.

create table app_reviews (
  id          bigserial primary key,
  rating      smallint not null check (rating between 1 and 5),
  body        text not null check (char_length(body) between 1 and 1000),
  context     text not null default '' check (char_length(context) <= 100),
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at  timestamptz not null default now()
);

-- Same access rules as the other tables: only the API (service_role) can read or write.
alter table app_reviews enable row level security;
revoke all on app_reviews from anon, authenticated;
grant select, insert, update, delete on app_reviews to service_role;
grant usage, select on sequence app_reviews_id_seq to service_role;
