# Historical proposal

This records the design before round three. Resolved choices are in DECISIONS.md and WORKFLOW_ROUND_3.md; active behavior is in IMPLEMENTATION.md. Remaining mentions of open choices below are historical.

# Refactor and workflow redesign proposal

Updated 12 October 2026 after the module interview. Accepted requirements are in [DECISIONS.md](DECISIONS.md). Open recommendations below must be resolved jointly before implementation.

## Accepted destination

Actions-only, CPU, twice daily, one task at a time. Google Sheets supplies ordered Not Posted work and visible progress. Normal operation is entirely automated. Produce a roughly 60-second English voice-cloned narration with full-screen animations and timed word captions. Publish the same deliverable to YouTube, Instagram, and Facebook. Complete only when all three publications have verified links.

Remove presenter, Wav2Lip, face detection, and GFPGAN from the future workflow. No automatic restart/resume after terminal failure: save what happened, pause future processing, and email the user. Do not introduce a separate database, editing product, publishing retry dashboard, or generated-output cache.

## Proposed deep modules after removing presenter

| Module | Owns | Proposed small interface | Shared decision status |
| --- | --- | --- | --- |
| Workflow | Serial stage execution, progress, outcomes, stopping | `run(task) -> JobOutcome` | Stop policy accepted; Sheet PAUSED control flag accepted |
| Sheets | Ordered intake, stable ID, row validation, progress/results, possible control flag | `nextTask()`; `record(event)` | Intake accepted; control schema open |
| Content | Supplied/generated narration, visual beats, quality pass, shared social copy | `prepare(task) -> ContentPlan` | Technical/simple English; two total attempts accepted |
| Voice | One Voicebox voice, reference transcript, pacing, output checks | `synthesize(narration) -> Narration` | Minimal Python Voicebox on Actions CPU accepted |
| Captions | AssemblyAI transcription/alignment, technical correction, word track | `align(narration) -> CaptionTrack` | Engine and word highlighting accepted |
| Rendering | Scene planning, timed animation, captions, BGM, cover, encoding | `render(request) -> RenderedVideo` | Custom generated code; 1080×1920/60 fps; fixture checks accepted; code interface open |
| Publishing | Shared deliverable, platform adapters, link verification, staging | `publish(video) -> PublicationResults` | All targets attempted; provider verification; public YouTube accepted |
| Workspace | Isolated temporary files, output checks, cleanup | `open(job)`; `cleanup(job)` | Isolation and summary-only failure retention accepted |
| Operations | Config, Actions entry points, incident pause/reporting, email | `config()`; `finalize(outcome)` | Interview unfinished |

These are modules with interfaces and private implementations, not one class per responsibility. Operations may need separate lifecycle/notification ownership if its interface becomes broad. The workflow owns order; rendering owns internal animation/composition complexity.

## Revised execution proposal

1. Validate configuration and inspect a persistent pause condition before claiming work.
2. Read Sheets in order; record and skip invalid input; accept only eligible Not Posted tasks. An empty queue is a successful no-op without email or pause.
3. Write stable job/task ID and processing state before expensive work. Persist last started/completed stage as work advances.
4. Prepare a supplied or generated narration and coordinated visual explanation beats. Allow two total stage attempts with no provider fallback.
5. Synthesize one Voicebox voice on CPU, validate output, and adjust pacing only when needed. No cloned-voice or generated-audio cache across runs.
6. Use AssemblyAI for actual audio word timings and derive a shared animation/caption timeline.
7. Validate custom AI animation code and render full-screen frames at 1080×1920, 60 fps without presenter, manual UI driving, or display recording. BGM and cover policy remains open.
8. Attempt the same artifact on all three platforms, even if one attempt fails. Store each confirmed outcome immediately; do not automatically retry failed uploads.
9. Verify provider published/ready state plus publication ID and canonical link; mark Completed only after all three satisfy this. No public-browser check is required.
10. Clean staging after successful consumers are finished; clean temporary workspace according to agreed policy.
11. On failure, stop new work, persist stage/error/known remote outcomes, activate the agreed pause mechanism, and email details. Do not silently rerun or erase completed remote publications.
12. Use in-job finalization only. The user explicitly accepts that abrupt runner loss can leave stale state/staging and no email; do not add an independent reporting workflow.

The stage order is still a proposal. Publishing attempts all targets before terminal reporting. The precise next-run handling of stale Processing is open and must not imply automatic resume.

## Rendering direction selected by the user

**A. Typed templates:** AI supplies explanation beats and a validated scene plan using established visual primitives. A deterministic renderer draws frames at explicit times and encodes video. Best initial reliability, controlled layout, and CPU predictability; visual vocabulary requires thoughtful design.

**B. Generated animation code:** AI supplies custom animation code per reel, which an isolated renderer evaluates at explicit frame times. More freedom and novelty; greater validation/repair complexity and variable render cost. Removes screen recording but does not remove arbitrary-code failures.

**C. Hybrid:** typed templates for most scenes with isolated generated scenes when needed. More expressive; introduces two rendering paths and their validation burden. Use only if the actual topics require the extra expressiveness.

Selected: B, custom AI animation code. A and C remain rejected alternatives for this round. Do not assume a particular library or code contract until chosen and measured. One rendering module contains private planning, generation/validation, timing, frame rendering, composition, and encoding.

Potential visual families: flow diagrams, message passing, comparisons, timelines, step-by-step transformations, counters, highlighting, conceptual illustrations, and typography. These should explain technical education in simple English, with full-screen visuals and word captions.

## TypeScript and runtime contracts

Propose strict TypeScript for all first-party Node/renderer code, including `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and unknown catch values. Validate Sheets cells, configuration, AI plans, provider payloads, Python output, and media metadata at runtime.

Use discriminated outcomes for NoWork, Completed, Failed, Cancelled, and partial/uncertain publication. The names and Sheet representation remain open. Successful results must contain their required values; avoid boolean success with arbitrary optional payloads. Distinguish seconds/milliseconds/frame indices and local paths/public URLs.

Keep the accepted minimal Python engine for Voicebox inference; remove Wav2Lip rather than porting it. Use a typed process contract with explicit exit behavior, timeout, logs, and media validation. No raw browser or provider SDK object should leak into the workflow interface.

A free-tier goal is a budget requirement, not evidence that every current third-party service is free. Validate the actual account quotas and repo visibility before setting runtime/resolution promises.

## Proposed delivery order

1. Resolve remaining workflow/renderer contract/operations MCQs and exact schedule. Accepted round-two choices are recorded in DECISIONS.md.
2. Define Sheet status/control schema and domain contracts; establish offline fixtures and failure scenarios.
3. Create strict TS runtime and Actions entry points with validated config and serialized execution.
4. Build the voice + AssemblyAI + rendering vertical slice with short fixture media. Measure CPU/memory/quality at the accepted 1080×1920, 60 fps profile before committing to a runtime budget.
5. Implement three platform adapters, publication verification, immediate Sheet result writes, and terminal failure behavior.
6. Implement cancellation/incident handling, cleanup, and actionable email; test hard-stop paths separately from ordinary exceptions.
7. Remove proven-unused presenter/manual/API/alternate renderer code after dependency review. Update dependencies, workflow downloads, setup docs, and asset requirements.
8. Have the user run controlled live integration verification; retire old entry points once agreed acceptance criteria pass.

## Verification

Test the interface callers use: row eligibility and invalid-row skip, stage recording, content schema/quality, process failure, audio quality, word timing, scene overlap, frame export, media container/duration, publication partial/uncertain results, pause persistence, cancellation, and cleanup. Fake provider adapters support offline tests; do not call the publicly publishing main runner as a smoke test.

No provider fallback, automatic resume, voice-prompt/generated-output caching, or manual review is introduced. Model/dependency download caches are allowed. Bounded in-stage repair remains separate from restarting a failed job.

## Frame-time feasibility evidence

A possible DOM/SVG implementation can use a paused GSAP timeline and explicit time seeking; GSAP documents that seeking changes time without changing paused state. [GSAP seek](https://gsap.com/docs/v3/GSAP/Timeline/seek%28%29/).

Playwright supports element screenshots, but its animation-disable option fast-forwards or cancels certain native animations. A generated renderer therefore needs explicit frame-state control rather than assuming that disabling animations freezes them at the correct time. [Playwright screenshot](https://playwright.dev/docs/api/class-locator#locator-screenshot).

This supports evaluating the approach; it does not prove render performance, arbitrary-code isolation, visual fidelity, or deterministic callback behavior. Those require fixture validation and measured CPU trials.
