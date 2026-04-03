-- WhyNot Archive — Database Schema
-- Run this in the Supabase SQL editor to set up tables

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- Users table (extends Supabase auth.users)
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz default now()
);

-- Topics table
create table if not exists public.topics (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  slug text not null unique,
  category int not null check (category in (1, 2, 3)),
  summary text,
  llm_perspective text,
  search_context text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists topics_slug_idx on public.topics(slug);
create index if not exists topics_category_idx on public.topics(category);
create index if not exists topics_created_at_idx on public.topics(created_at desc);

-- Full-text search index on topics
alter table public.topics add column if not exists fts tsvector
  generated always as (to_tsvector('english', coalesce(question, '') || ' ' || coalesce(summary, ''))) stored;
create index if not exists topics_fts_idx on public.topics using gin(fts);

-- Conversations table
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid references public.topics(id) on delete set null,
  user_id uuid not null references public.users(id) on delete cascade,
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists conversations_topic_id_idx on public.conversations(topic_id);
create index if not exists conversations_user_id_idx on public.conversations(user_id);

-- Arguments table
create table if not exists public.arguments (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.topics(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  position text not null check (position in ('for', 'against')),
  summary text not null,
  created_at timestamptz default now()
);

create index if not exists arguments_topic_id_idx on public.arguments(topic_id);

-- Row Level Security
alter table public.users enable row level security;
alter table public.topics enable row level security;
alter table public.conversations enable row level security;
alter table public.arguments enable row level security;

-- Users: users can read their own record, insert on signup
create policy "Users can read own record" on public.users for select using (auth.uid() = id);
create policy "Users can insert own record" on public.users for insert with check (auth.uid() = id);

-- Topics: public read, authenticated insert/update
create policy "Topics are publicly readable" on public.topics for select using (true);
create policy "Authenticated users can create topics" on public.topics for insert with check (auth.role() = 'authenticated');
create policy "Authenticated users can update topics" on public.topics for update using (auth.role() = 'authenticated');

-- Conversations: public read, owner insert/update
create policy "Conversations are publicly readable" on public.conversations for select using (true);
create policy "Users can create conversations" on public.conversations for insert with check (auth.uid() = user_id);
create policy "Users can update own conversations" on public.conversations for update using (auth.uid() = user_id);

-- Arguments: public read, authenticated insert
create policy "Arguments are publicly readable" on public.arguments for select using (true);
create policy "Authenticated users can create arguments" on public.arguments for insert with check (auth.role() = 'authenticated');

-- Function to handle new user signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

-- Trigger on auth.users insert
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
