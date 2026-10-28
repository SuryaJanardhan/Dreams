alter table public.approval_requests
  add column if not exists claimed_at timestamptz;

create index if not exists approval_requests_claim_recovery
  on public.approval_requests (status, claimed_at, decided_at)
  where status in ('approved', 'rejected') and finished_at is null;
