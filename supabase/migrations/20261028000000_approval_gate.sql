create table if not exists public.approval_requests (
  id uuid primary key,
  job_id uuid not null unique,
  task_id text not null,
  sheet_row integer not null check (sheet_row > 0),
  status text not null check (status in (
    'pending', 'approved', 'rejected', 'processing',
    'completed', 'failed', 'expired'
  )),
  token_hash text not null unique check (length(token_hash) = 64),
  preview_key text not null,
  payload jsonb not null,
  expires_at timestamptz not null,
  reminder_sent_at timestamptz,
  decided_at timestamptz,
  finished_at timestamptz,
  dispatch_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists approval_requests_decisions
  on public.approval_requests (status, decided_at)
  where status in ('approved', 'rejected');

create index if not exists approval_requests_pending
  on public.approval_requests (status, created_at)
  where status = 'pending';

alter table public.approval_requests enable row level security;

-- No anon/authenticated policies: only the service role used by Actions and
-- the review Edge Function can read or mutate approval payloads.
revoke all on table public.approval_requests from anon, authenticated;
