# Secure publication approval gate

## Outcome

No social provider is contacted by the generation workflow. A successful run
stops at `AwaitingApproval` after the rendered video is uploaded to a temporary
Supabase object and a review email is delivered.

The email contains a signed preview link and Approve/Reject buttons. Buttons
open the Supabase Edge Function review page. A GET request is always read-only;
the reviewer must make a final POST decision so email link scanners cannot
publish accidentally.

## State flow

```text
Not Posted
  -> Processing
  -> AwaitingApproval
       -> rejected -> Rejected (no social calls)
       -> approved -> Processing/publishing
          -> Completed only after three verified canonical links
          -> Partial/Failed and pipeline pause otherwise
```

Approval tokens are random 256-bit bearer values. Only their SHA-256 hashes are
stored. They are single-use and expire after 72 hours. The approval table has
RLS enabled with no client policies.

The raw token is placed in the URL fragment, which browsers do not send in HTTP
requests or access logs. The review page transfers it in a POST body for preview
lookup and the final decision.

The scheduled control step sends one reminder after 24 hours. The reminder
rotates the bearer token so the first email link becomes invalid. At 72 hours,
the link stops accepting decisions. The next twice-daily maintenance run marks
the request `ApprovalExpired`, removes its preview and publishes nothing.

## Deployment

Apply `supabase/migrations/20261028000000_approval_gate.sql` and deploy
`review-approval` with JWT verification disabled as configured in
`supabase/config.toml`.

The Edge Function uses Supabase-provided `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY`. Configure:

- `APPROVAL_BUCKET=videos`
- `GITHUB_REPOSITORY=SuryaJanardhan/Dreams`
- `GITHUB_DISPATCH_TOKEN`: fine-grained token with Actions/workflow dispatch
  access to this repository only

If GitHub dispatch is temporarily unavailable, the persisted decision is not
lost. The twice-daily scheduled workflow claims it before generating new work.
Rejected claims can be reclaimed automatically because they have no social
side effects. A stale approved publishing claim pauses for manual recovery
instead of risking duplicate posts after an unknown crash point.

## Operational rules

- Never email a direct state-changing URL.
- Never store the raw approval token in Sheets, logs, artifacts or Supabase.
- Never publish a `pending`, expired or unknown review.
- Rejection updates the Sheet, deletes the temporary preview and emails the
  outcome without pausing healthy future scheduling.
- Approved publishing retains the existing all-platform verification and
  partial-publication incident behavior.
