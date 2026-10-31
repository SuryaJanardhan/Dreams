# AI quota strategy

## Decision

Use model-specific lanes within Gemini:

- `gemini-2.5-flash-lite`: grounded research, script generation, content audit,
  declarative visual planning, visual-plan repair and asset search.
- `gemini-2.5-flash`: downloaded-image validation and rendered-frame quality
  review only.

Google applies quotas per project and model, not per API key. Multiple keys from
one project therefore do not create more capacity. The lanes above reserve the
stronger multimodal quota for the few calls where vision quality matters and
move JSON/text work to the lighter model.

## Request budget per video

Normal path:

1. Research: 1 request.
2. Script and independent content audit: 2 requests.
3. Visual plan: 1 request.
4. Asset search/validation: 0–4 requests, only for genuine product/interface
   images.
5. Rendered-frame review: 1 request.

Expected total: 5 requests without external assets, up to 9 with two assets.
A targeted repair can add two requests. Scheduled production does not run the
manual credential diagnostics.

## Failure policy

- HTTP 429 is terminal for the run and is never retried as a content defect.
- The Sheet remains paused and the email includes the provider reset estimate.
- Do not rotate API keys from the same Google project; it does not increase the
  project quota.
- Do not publish or bypass quality checks when a model quota is unavailable.

## Capacity options

1. **Recommended free configuration:** the two Gemini model lanes above, with
   at most two scheduled videos per day and asset intents used sparingly.
2. **Recommended production configuration:** enable Gemini paid Tier 1, set a
   small Cloud Billing budget/alert and retain the same request budget.
3. **Optional emergency provider:** OpenRouter behind the existing typed Gemini
   interface, enabled only by an explicit configuration decision. Its free
   models have their own daily limits and variable availability, so they are not
   the primary production path.

Batch inference is not used because approval-oriented video generation needs a
single result within the current Actions run; Gemini Batch can take much longer
and is a paid feature.
