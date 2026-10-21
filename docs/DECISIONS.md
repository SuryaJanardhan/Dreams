# Shared decision record

Updated 12 October 2026. Clear user answers are recorded below. Interpretations and unresolved choices are marked explicitly. Implementation started after explicit user authorization.

## Working agreement

- Propose logic/workflow changes and strict TypeScript with strong runtime contracts.
- Decisions are shared: show alternatives and the engineering recommendation; ask MCQs for ambiguity.
- Maintain 10–15 interview questions per module. The question bank has 12 per original module.
- Do not infer acceptance from silence or a recommendation appearing in a document.

## Accepted product and workflow requirements

| Area          | User requirement                                                             | Implication                                                                                          |
| ------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Execution     | GitHub Actions only, CPU, free-tier operation                                | No local production runner, persistent cloud worker, or GPU requirement                              |
| Frequency     | Twice daily, subject to Actions time limits                                  | Exact times and runtime budget remain open; output is 1080×1920 at 60 fps                            |
| Concurrency   | Never run multiple content jobs concurrently                                 | Serialize execution; no parallel task claiming                                                       |
| Automation    | No manual review or intervention in a healthy pipeline                       | Remove editor/login/upload/record dialogs from runtime                                               |
| Completion    | All three platforms must succeed with verified links                         | Any failed or unverified publication prevents Completed                                              |
| Progress      | Save whatever happened and keep status visible                               | Persist stage and publication summaries even without artifact retention                              |
| Failure       | Stop processing, pause future pipeline runs, clearly email user              | No automatic job resumption or unattended platform retry                                             |
| Recovery      | User acts after failure                                                      | Successful remote publications must remain visible; do not repeat them silently                      |
| Cancellation  | Stop, clear generated data, email what ran and what was cleared              | Clean generated data when finalization runs; abrupt-loss reporting/cleanup is explicitly best effort |
| Input         | Google Sheets only, in row order, Not Posted eligibility                     | No queue provider, priority scheduler, or automatic retry UI                                         |
| Identity      | Stable task IDs accepted                                                     | Do not rely solely on a mutable row number                                                           |
| Invalid input | Skip invalid rows, do not upload them                                        | Record reason; avoid stopping healthy later tasks merely for an invalid row                          |
| Sheet schema  | Documented header aliases accepted                                           | Normalize and validate once                                                                          |
| User edits    | User assures no editing during processing                                    | No task-revision product feature required                                                            |
| Results       | Sheet remarks explain partial successes/failures and retain successful links | A partial result is not Posted/Completed                                                             |
| Persistence   | Keep state simple; no added storage system for its own sake                  | Sheets stores progress and a persistent PAUSED flag in a control tab                                 |

Healthy automation and manual incident recovery are distinct: the user rejected manual steps during normal operation but explicitly requires user action after failure.

## Accepted content, audio, and caption requirements

- Supplied narration bypasses script generation. Clarify the exact source column and distinction between topic and narration before implementation.
- Target roughly one minute, but let a complete explanation end naturally within 40–75 seconds; do not globally time-stretch every voice track to exactly 60 seconds.
- Preserve current English voice/style and no-intro/no-outro rules.
- No external factual verification provider is required. The content-quality layer grades clarity, technical accuracy, example usefulness, authenticity, format and duration; generic introductions, engagement bait and prompt labels are hard failures.
- No provider fallbacks. Each content, voice, caption, or scene stage gets two total attempts: initial attempt plus one repair/regeneration.
- Generate shared social copy from the content plan. No prompt-version cache invalidation machinery required because generated-output caching is not wanted.
- Voicebox remains the voice engine; one voice identity, reviewed reference transcript, CPU execution.
- Choose synthesis pacing first if it works; use processing only when necessary. Segmentation is an engineering option if needed.
- No multilingual support, cross-run voice cloning/output caches, or deterministic-audio requirement. Regenerate invalid audio within an agreed attempt limit.
- Voicebox uses a minimal Python ML engine on CPU inside Actions; orchestration and rendering become strict TypeScript.
- AssemblyAI is mandatory. Word-level highlighting is required.
- Captions and visuals must align with actual narration timing; correct technical words without concealing substantive speech mismatches.
- Caption format/readability thresholds are delegated to engineering, with timing/quality verification required.
- One language; no caption-hiding feature requested.
- Content is technical education in simple English, preserving the current scope.

## Accepted visual and publishing requirements

- Remove talking head/presenter layouts, face detection, lip sync, Wav2Lip, and GFPGAN from the future pipeline. Physical deletion follows dependency review during implementation.
- Full-screen animated visuals with audio and captions; high-resolution output.
- No manual composer/editor product requirement. Avoid live screen capture.
- Rendering owns final cover/BGM/caption composition where retained; presenter is explicitly excluded.
- AI writes custom animation code for each video; validate it and render frame by frame. Reusable-template-only rendering was not selected.
- Publish one shared video/audio/caption payload to YouTube, Instagram, and Facebook. Platform adapters still satisfy each platform's required transport fields internally.
- All three verified outcomes are necessary for final completion.
- Supabase stays as Meta staging. On success or failure, remove generated local files and staging after no in-flight consumer needs them. Retain failure summaries and known successful social links/posts.
- No automatic retry of failed targets, separate publication audit system, or deliberate republish feature requested.
- Record failures and whatever links are known in Sheets. Essential provider IDs may still be needed to verify links; this is distinct from building an audit product.
- User will perform real production integration verification manually; offline regression checks remain necessary.
- YouTube publishes publicly immediately.

## Accepted artifact requirements and unfinished answers

- No long-term generated artifact archive required; isolated per-job workspace accepted.
- Retention selection and limits delegated to engineering, but must fit free-tier goals and cancellation cleanup.
- No user-facing artifact-ID/hash system required. Internal typed file metadata still needed for correct rendering and validation.
- Artifact questions 6–12 and operations questions 1–12 have not all received direct answers; related round-two choices settle cleanup, cache scope, and abrupt-loss limitations.

## Accepted MCQ round two

| Q   | Selected policy                                         | Consequence                                                                                                                                                            |
| --- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | B: Custom AI-generated animation code                   | Validate, isolate, and render at explicit frame times; code contract still open                                                                                        |
| 2   | A: Technical education in simple English                | Preserve topic and language scope                                                                                                                                      |
| 3   | A: Persistent Sheet PAUSED control flag                 | No self-editing YAML or GitHub workflow-disable calls                                                                                                                  |
| 4   | B: Finish attempts on all three platforms               | Publication-stage failure is collected; other pipeline stages still stop on terminal failure                                                                           |
| 5   | B: Provider published/ready state + ID + canonical link | No browser/public-access check required                                                                                                                                |
| 6   | A: CPU Voicebox Python inside Actions                   | Strict TypeScript for first-party orchestration/rendering; typed Python process contract                                                                               |
| 7   | A: Two total attempts                                   | One initial generation plus one repair, with no later automatic job restart                                                                                            |
| 8   | A: Summary-only failure retention                       | Clean temporary media/staging only after consumers finish; successful remote posts remain                                                                              |
| 9   | A: YouTube public immediately                           | No review gate or scheduled/private visibility                                                                                                                         |
| 10  | B: 1080×1920 at 60 fps                                  | CPU runtime must be measured; do not silently lower the chosen profile                                                                                                 |
| 11  | B: In-job finalization only                             | No independent reporting workflow. Abrupt crashes may leave stale Sheet state/staging or no email; automatic PAUSED persistence cannot be guaranteed after runner loss |
| 12  | A: Model/dependency download caches allowed             | Remove voice-prompt/output caches, allow infrastructure caching within limits                                                                                          |
| 13  | A: Three topic fixtures + timeline/sampled-frame checks | No additional AI visual critic selected; some visual checks remain heuristics                                                                                          |
| 14  | A: Successful NoWork                                    | No failure email or global pause for an empty queue                                                                                                                    |

A graceful exception/cancellation attempts progress persistence, pause, cleanup, and email. A hard runner loss may prevent any of these; the latest explicit MCQ answer accepts this limit. The accepted round-three policy detects stale Processing on the next run, records interruption, and pauses without resuming or publishing.

Publishing is the explicit exception to immediate fail-stop: finish each platform attempt, collect confirmed and uncertain outcomes, then pause if any required verification failed. No automatic republishing of failed targets.

## Round-three resolution

The recommended options in WORKFLOW_ROUND_3.md are accepted. Implementation details and remaining verification limits are recorded in IMPLEMENTATION.md.

## Verified platform facts

- GitHub supports enabling/disabling individual workflows through its REST API; fine-grained tokens require Actions write permission. [GitHub workflow API](https://docs.github.com/en/rest/actions/workflows).
- Standard GitHub-hosted runners are free for public repositories; private repositories have plan allowances and larger runners are billed. This does not establish that Gemini, AssemblyAI, email, or Supabase usage is free for this project. [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions).
- Hosted jobs have execution limits. Twice-daily scheduling still needs measured CPU time and account/repository allowance checks. [Actions limits](https://docs.github.com/en/actions/reference/limits).

The production workflow has now been edited locally. No workflow changes have been pushed or live production run triggered.

## Implementation authorization and round-three choices

The user instructed us to follow the recommended list with grades, cleanup, and emails, then explicitly said to start refactoring and ask about new doubts during work. Round-three A options are accepted; prior round-two B overrides remain: custom animation, all-platform attempts, provider-only link verification, 60 fps, and in-job finalization. User delegated recovery of the reference transcript to the agent.
