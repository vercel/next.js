create table if not exists todos (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  title text,
  is_complete boolean default false,
  user_id uuid references auth.users default auth.uid()
);

-- Set up Row Level Security (RLS)
-- See https://supabase.com/docs/guides/auth/row-level-security for more details.
alter table todos
  enable row level security;

create policy "Authenticated users can select todos" on todos
  for select to authenticated using (true);

create policy "Authenticated users can insert their own todos" on todos
  for insert to authenticated with check (auth.uid() = user_id);
