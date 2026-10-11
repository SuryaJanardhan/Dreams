# Module decision interviews

Updated 12 October 2026. These are the original 120 prompts with the latest interpreted answers. Explicit ambiguity stays open. DECISIONS.md records accepted requirements; recommendations are not automatically accepted.

Use rounds: ask only questions whose prerequisites are resolved. The workflow/product round comes first. Rendering approach, state storage, and migration choices depend on those answers. Do not treat the entire question bank as one simultaneous form.

## 1. Workflow

### Q1. What makes a job complete: rendered video, any platform, or all requested platforms?

Initial recommendation: Track rendering and each publication separately; partial publication is its own outcome.

Shared answer: All three successful publications and verified links define Completed; persist progress.

### Q2. Should videos publish unattended or wait for your review?

Initial recommendation: Make review policy explicit; support a render-only outcome.

Shared answer: Fully automated healthy operation; no manual review.

### Q3. Is this one channel/brand, or must it support several independent channels?

Initial recommendation: Start with the real current channel count; avoid speculative multi-tenant machinery.

Shared answer: Three platforms specified; multiple independent brands/accounts not established.

### Q4. Where should the primary runner operate: local machine, Actions, or a persistent worker?

Initial recommendation: Select one supported primary environment before promising several.

Shared answer: GitHub Actions only; no local or separate cloud production runner.

### Q5. What is the expected daily volume and acceptable completion time?

Initial recommendation: Set measurable targets from intended usage and benchmark on the chosen hardware.

Shared answer: Twice daily; exact schedule and measured budget open.

### Q6. After a failed stage, should a job resume or regenerate everything?

Initial recommendation: Resume validated checkpoints unless their inputs or producing version changed.

Shared answer: Terminal failure stops workflow and future processing; user recovers.

### Q7. If a crash follows an upload, should the runner reconcile remote state before retrying?

Initial recommendation: Reconcile; an uncertain upload result is not permission to upload again.

Shared answer: Sheet PAUSED flag for handled failures; abrupt runner-loss pause/reporting is best effort with no external reporter.

### Q8. Can different jobs run concurrently?

Initial recommendation: Bound concurrency by resources and require isolated workspaces and safe claims.

Shared answer: No concurrent jobs.

### Q9. Should cancellation stop immediately or let the current expensive stage finish?

Initial recommendation: Cancel promptly where supported; preserve valid completed artifacts.

Shared answer: Cancellation stops, clears generated data, and emails completed steps/cleanup details.

### Q10. What budget limits should stop a job: money, provider requests, or elapsed time?

Initial recommendation: Use explicit per-job limits and typed exhausted-budget outcomes.

Shared answer: Free-tier operation only; actual provider/account allowances must be checked.

### Q11. When no task exists, is that normal idle behavior or an operational failure?

Initial recommendation: Treat it as NoWork and exit successfully without failure email.

Shared answer: Successful NoWork with a short log; no email and no pause.

### Q12. Which failures must block downstream work versus permit a degraded result?

Initial recommendation: Make required stages fail explicitly; agree optional presenter/BGM/platform policies separately.

Shared answer: Delegated recommendation; required stages fail, optional degradation requires explicit policy.

## 2. Task intake

### Q1. Should Google Sheets remain the only task source?

Initial recommendation: Retain it initially; introduce another intake adapter only for a real use case.

Shared answer: Google Sheets only.

### Q2. Can we add stable task IDs to the sheet?

Initial recommendation: Use an immutable ID rather than a row number that changes when rows move.

Shared answer: Stable task IDs accepted.

### Q3. Should the existing description and scripts columns affect generation?

Initial recommendation: Use description as context and explicitly distinguish supplied narration from a topic.

Shared answer: Use sheet order; precise supplied-script versus idea behavior needs mapping.

### Q4. Which statuses should be eligible for automatic retry?

Initial recommendation: Use structured execution state; do not infer retries from an error message.

Shared answer: Only Not Posted tasks eligible.

### Q5. Should an empty or malformed row be skipped or stop all processing?

Initial recommendation: Report invalid rows distinctly and continue to other eligible work when policy permits.

Shared answer: Skip invalid rows and do not publish them.

### Q6. Do we preserve flexible header aliases or require a fixed schema?

Initial recommendation: Normalize a documented alias set, then validate required columns.

Shared answer: Documented aliases/validation accepted.

### Q7. Can execution state live outside Sheets?

Initial recommendation: Keep Sheets readable for humans; use durable state if resumability and concurrency are required.

Shared answer: Other state storage possible but keep simple; prefer no extra database.

### Q8. What should happen to a Processing row after a runner disappears?

Initial recommendation: Recover through expiring claims and persisted stage results.

Shared answer: Graceful shutdown and proper Sheet update; hard-crash handling open.

### Q9. Should priority, scheduled publication time, or FIFO choose the next task?

Initial recommendation: Use FIFO until an actual scheduling requirement justifies more.

Shared answer: Sheet order; no priority.

### Q10. Can a user edit a task while it is processing?

Initial recommendation: Snapshot the accepted brief and make edits create an explicit revision.

Shared answer: User assures no edits during processing.

### Q11. Who can trigger a retry, and should it retain successful platform links?

Initial recommendation: Keep successful outcomes; retry only selected incomplete work.

Shared answer: No retry feature required.

### Q12. What should the sheet show for partial publication or cancelled work?

Initial recommendation: Expose distinct states and per-platform links/errors without overwriting useful results.

Shared answer: Remarks capture actual outcome; retain successful links; email failed parts.

## 3. Content

### Q1. Is technical education the only supported content genre?

Initial recommendation: Use one explicit brand/content brief first.

Shared answer: Technical education in simple English confirmed.

### Q2. Should supplied narration bypass generation?

Initial recommendation: Support validated supplied narration as a clear mode.

Shared answer: Supplied narration bypasses generation.

### Q3. Is duration or word count the real target?

Initial recommendation: Target spoken duration; use word count as a preliminary estimate.

Shared answer: Target 60 seconds.

### Q4. What factual verification is required before narration can proceed?

Initial recommendation: Define source requirements for factual claims; do not equate fluent text with accuracy.

Shared answer: No external factual verification requested.

### Q5. What voice, language, terminology, and audience level must remain consistent?

Initial recommendation: Centralize those rules in a versioned content brief.

Shared answer: Preserve current English voice/style.

### Q6. Should narration and scene meaning be planned together?

Initial recommendation: Generate a coherent content plan with explicit explanation beats.

Shared answer: Joint narration/visual planning accepted.

### Q7. Which provider fallbacks are acceptable when quality or style differs?

Initial recommendation: Permit only agreed fallbacks and record the actual provider/model.

Shared answer: No fallbacks.

### Q8. How many revision attempts may repair invalid or weak output?

Initial recommendation: Bound attempts and surface the final validation failure.

Shared answer: Two total attempts: initial plus one repair/regeneration.

### Q9. Should social copy reuse the narration or be generated from the content plan?

Initial recommendation: Derive it from the same validated meaning and adapt by platform.

Shared answer: Generate social copy from content plan.

### Q10. Should prompt changes invalidate cached content?

Initial recommendation: Record prompt/model versions and input hashes.

Shared answer: No prompt-driven cache invalidation required.

### Q11. Should we enforce the current no-intro/no-outro rules?

Initial recommendation: Keep them only if they reflect the desired brand rather than historical defaults.

Shared answer: Preserve no-intro/no-outro rules.

### Q12. How will we judge content quality on representative topics?

Initial recommendation: Agree a small corpus and score clarity, accuracy, coherence, and duration fit.

Shared answer: Add content-quality layer.

## 4. Voice

### Q1. Must Voicebox remain the only narration engine?

Initial recommendation: Retain it initially behind a small synthesis interface.

Shared answer: Voicebox mandatory.

### Q2. How many voice identities and reference samples are needed?

Initial recommendation: Model named voice profiles only to the extent actually required.

Shared answer: One voice identity.

### Q3. Should reference transcripts be supplied or inferred?

Initial recommendation: Prefer a reviewed reference transcript for stable production cloning.

Shared answer: Reviewed reference transcript accepted.

### Q4. What duration, loudness, and intelligibility criteria reject generated audio?

Initial recommendation: Validate actual output metadata and audible quality rather than file existence.

Shared answer: Engineering defines general audio acceptance thresholds.

### Q5. Should pacing be controlled in synthesis or with postprocessing?

Initial recommendation: Use one deliberate pacing policy; avoid stacking unrelated slowdown mechanisms.

Shared answer: Prefer synthesis pacing if sufficient; otherwise processing.

### Q6. Do we need multilingual narration?

Initial recommendation: Declare supported languages and verify each with real samples.

Shared answer: No multilingual requirement.

### Q7. Is local inference mandatory, or may hosted inference be considered?

Initial recommendation: Compare operational cost and output quality before selecting an alternative.

Shared answer: Minimal Python Voicebox engine on CPU inside Actions.

### Q8. Should synthesis remain single-pass or be segmented?

Initial recommendation: Prefer single-pass until duration/memory measurements justify segmentation.

Shared answer: Single pass or segmentation delegated to engineering.

### Q9. Must repeated identical inputs reproduce the same audio?

Initial recommendation: Define acceptable variability and persist accepted audio instead of casually regenerating it.

Shared answer: No reproducibility requirement; prefer one pass.

### Q10. How should GPU/CPU/model-size selection work?

Initial recommendation: Validate a deployment profile and expose actual device/model in diagnostics.

Shared answer: CPU.

### Q11. Which inputs should invalidate a cached voice prompt or narration?

Initial recommendation: Include sample, transcript, model, instructions, and producing version where relevant.

Shared answer: Remove voice-prompt/generated-output caching; allow model/dependency download caches.

### Q12. What happens if narration quality fails after a successful subprocess exit?

Initial recommendation: Reject the artifact with a typed quality failure and a bounded repair policy.

Shared answer: Regenerate invalid output within agreed limit.

## 5. Talking head

### Q1. Is a talking head required in every video?

Initial recommendation: Make it a product decision; animation-only layouts may avoid expensive inference.

Shared answer: Remove: audio and full-screen animation only.

### Q2. Can presenter layouts vary by topic or scene?

Initial recommendation: Let the accepted scene plan declare presenter usage.

Shared answer: Remove: audio and full-screen animation only.

### Q3. Which lip-sync defects make an output unacceptable?

Initial recommendation: Define mouth alignment, face continuity, and artifact thresholds using sample videos.

Shared answer: Remove: audio and full-screen animation only.

### Q4. Should GFPGAN run always, conditionally, or never?

Initial recommendation: Enable it only where measured quality gain justifies time and visual changes.

Shared answer: Remove: audio and full-screen animation only.

### Q5. How should a base clip shorter than narration be handled?

Initial recommendation: Choose an explicit loop/trim policy and verify transition quality.

Shared answer: Remove: audio and full-screen animation only.

### Q6. Can we change the lip-sync engine if Wav2Lip quality is insufficient?

Initial recommendation: Evaluate alternatives against the same fixtures and intended deployment.

Shared answer: Remove: audio and full-screen animation only.

### Q7. How many faces are allowed in the input?

Initial recommendation: Require a clearly selected presenter rather than silently choosing a face.

Shared answer: Remove: audio and full-screen animation only.

### Q8. When is a face-detection cache valid?

Initial recommendation: Tie it to the exact source video, preprocessing, and detector version.

Shared answer: Remove: audio and full-screen animation only.

### Q9. What output resolution and framing are actually needed?

Initial recommendation: Render to the chosen delivery specification; avoid wasting inference on unused pixels.

Shared answer: High-resolution visuals; no face needed.

### Q10. Should missing restoration weights degrade or fail?

Initial recommendation: Treat required quality modes as explicit requirements; report optional degradation.

Shared answer: Not applicable after removal.

### Q11. How do we handle CPU-only machines and timeouts?

Initial recommendation: Apply measured resource profiles and fail clearly when the target cannot be met.

Shared answer: Not applicable after removal.

### Q12. May a failed presenter stage fall back to full animation?

Initial recommendation: Allow it only if the accepted content/render policy says the result remains valid.

Shared answer: Not applicable after removal.

## 6. Captions

### Q1. Should caption text match the intended script or what was actually spoken?

Initial recommendation: Use the script as reference but align against actual audio and detect omissions.

Shared answer: Align script reference against actual speech.

### Q2. Is AssemblyAI mandatory, or may local alignment replace it?

Initial recommendation: Compare accuracy, cost, and timing quality before changing the engine.

Shared answer: AssemblyAI mandatory.

### Q3. Do we need word-level highlighting or only phrase-level subtitles?

Initial recommendation: Choose based on readability and desired visual style.

Shared answer: Word highlighting required.

### Q4. What maximum line length and reading speed should captions obey?

Initial recommendation: Use an explicit readability policy tested at phone size.

Shared answer: Readability rules delegated to engineering.

### Q5. Can technical words be corrected automatically?

Initial recommendation: Apply a reviewed vocabulary without hiding substantive spoken-text mismatches.

Shared answer: Technical-word correction accepted.

### Q6. Should the caption track be the timing source for animations?

Initial recommendation: Use a shared timeline anchored to audio, with caption/scene tracks derived from it.

Shared answer: Shared audio-based timing mandatory.

### Q7. Which formats must be exported besides internal caption data?

Initial recommendation: Keep a typed internal track and export SRT only where consumed.

Shared answer: Format delegated to engineering.

### Q8. What happens when transcription contains gaps or invalid timestamps?

Initial recommendation: Reject or repair deterministically with bounded attempts.

Shared answer: Repair invalid tracks within two total stage attempts.

### Q9. Should captions cover the intro frame or begin with narration?

Initial recommendation: Apply the agreed timeline offsets once at composition time.

Shared answer: Align captions/intro with audio timeline.

### Q10. Do captions need language-specific segmentation?

Initial recommendation: Support it only for declared narration languages.

Shared answer: No multilingual segmentation.

### Q11. May captions be hidden in some layouts?

Initial recommendation: Let the visual policy declare allowed positions and hiding rules.

Shared answer: No caption hiding requirement.

### Q12. How should alignment quality be measured?

Initial recommendation: Use fixture audio and inspect timing error, omissions, reading speed, and overlap.

Shared answer: Timing and alignment quality checks mandatory.

## 7. Rendering

### Q1. Is manual editing a product requirement or merely a tool used by automation?

Initial recommendation: Retain an editor only if someone needs its supported workflow.

Shared answer: No manual editor.

### Q2. Can AI output a constrained scene plan instead of arbitrary HTML?

Initial recommendation: Evaluate typed primitives first for repeatability and predictable layouts.

Shared answer: Custom AI animation code validated and rendered frame by frame selected.

### Q3. Which visual vocabulary must explain your topics well?

Initial recommendation: Start with flows, nodes, connectors, highlights, comparisons, counters, and timelines.

Shared answer: Visual vocabulary accepted; exact families depend on genre.

### Q4. How much visual novelty is required across videos?

Initial recommendation: Prefer clear explanation with controlled variation over unlimited generated code.

Shared answer: Full visual content required; novelty threshold open.

### Q5. Should special scenes allow custom HTML or code?

Initial recommendation: Add an escape hatch only after concrete scenes prove primitives insufficient.

Shared answer: Custom generated code selected; language/runtime/dependency contract still open.

### Q6. Should render export avoid live screen capture?

Initial recommendation: Prefer frame/timeline-based export if quality and performance meet the target.

Shared answer: Avoid screen capture.

### Q7. What resolution, frame rate, aspect ratio, and text size define delivery quality?

Initial recommendation: Choose explicit target profiles and inspect phone-scale output.

Shared answer: 1080×1920 at 60 fps chosen; runtime must be benchmarked.

### Q8. How should scenes align with narration beats?

Initial recommendation: Use one audio-based timeline; avoid separate guessed durations and accumulated delays.

Shared answer: Best narration/scene alignment required.

### Q9. What layout rules prevent captions, presenter, and diagrams overlapping?

Initial recommendation: Encode safe areas and placement constraints as renderer rules.

Shared answer: Safe-area policy remains open; no presenter.

### Q10. Must identical accepted scene plans render consistently?

Initial recommendation: Prefer reproducible output with fixed assets, fonts, and animation timing.

Shared answer: Response unclear; keep reproducibility policy open.

### Q11. Should cover, BGM, subtitles, and presenter compositing belong here?

Initial recommendation: Yes, under one render request, while keeping implementation stages private.

Shared answer: Renderer owns composition; presenter excluded.

### Q12. How will we compare the old composer and a new approach?

Initial recommendation: Render the same representative explanations and score fidelity, clarity, alignment, time, and cost.

Shared answer: Three topic fixtures with timeline and sampled-frame quality checks accepted.

## 8. Publishing

### Q1. Which platforms are actually required?

Initial recommendation: Explicitly configure targets per job.

Shared answer: YouTube, Instagram, Facebook.

### Q2. Must all platforms succeed before a job is considered complete?

Initial recommendation: Keep a per-platform report and a separate partial result.

Shared answer: All three required.

### Q3. Should YouTube publish public, private, unlisted, or scheduled?

Initial recommendation: Make visibility explicit in the publication request.

Shared answer: Public immediately.

### Q4. What should happen after upload succeeds but confirmation is lost?

Initial recommendation: Persist intent and reconcile provider state before retry.

Shared answer: Record Sheet state; count success only with provider published/ready state, ID, and canonical link.

### Q5. Do captions, titles, covers, and tags differ by platform?

Initial recommendation: Use typed platform requirements rather than blindly sharing one payload.

Shared answer: Shared video/audio/copy.

### Q6. Can failed targets retry without re-rendering?

Initial recommendation: Reuse the accepted artifact and preserve successful target outcomes.

Shared answer: No automatic target retries.

### Q7. Should Supabase remain the public staging provider?

Initial recommendation: Retain initially if it meets Meta access and retention requirements.

Shared answer: Keep Supabase.

### Q8. When can staging files be deleted safely?

Initial recommendation: Release them after consumers no longer need them, with failure retention policy.

Shared answer: Clean on success/failure after no consumer needs staging; retain summary and successful social links.

### Q9. How should quota, token expiry, and provider rejection be handled?

Initial recommendation: Distinguish retryable delays from configuration and content failures.

Shared answer: No detailed policy preference; terminal errors still need reporting.

### Q10. Do we need a publication audit trail?

Initial recommendation: Persist platform IDs, timestamps, visibility, attempts, and outcome.

Shared answer: No separate audit product.

### Q11. Can a user deliberately republish an already published artifact?

Initial recommendation: Make that an explicit new publication intent, never an accidental retry.

Shared answer: No deliberate republish feature expected.

### Q12. How should real integration verification avoid posting to production accounts?

Initial recommendation: Use controlled accounts and explicitly selected test visibility.

Shared answer: User performs live integration manually.

## 9. Artifacts

### Q1. Where should accepted artifacts live after a runner exits?

Initial recommendation: Persist enough to meet agreed resume and audit requirements.

Shared answer: No long-term artifact archive.

### Q2. Should every job have an isolated workspace?

Initial recommendation: Yes; eliminate shared root output names.

Shared answer: Isolated workspace accepted.

### Q3. Which artifacts must survive success and failure?

Initial recommendation: Keep accepted deliverables and useful failure evidence under a documented retention policy.

Shared answer: Retention delegated; exact failure policy open.

### Q4. How much disk/storage budget is available?

Initial recommendation: Set limits and monitor usage before enabling concurrent inference/rendering.

Shared answer: Check free-tier limits.

### Q5. Should artifacts be identified by path, immutable ID, or content hash?

Initial recommendation: Use artifact IDs with metadata and hashes; keep paths inside the module.

Shared answer: No user-facing ID/hash system.

### Q6. What provenance must accompany a video?

Initial recommendation: Store source job revision, model/prompt versions, scene plan, and producing stages.

Shared answer: Not answered.

### Q7. When may an artifact be reused after code or prompt changes?

Initial recommendation: Only if the relevant inputs and producing contract remain valid.

Shared answer: Not answered.

### Q8. How should partial files from interrupted writes be handled?

Initial recommendation: Write atomically where possible and never expose incomplete outputs as accepted.

Shared answer: Not answered.

### Q9. Who may delete accepted outputs?

Initial recommendation: Define retention and explicit release; avoid broad folder cleanup.

Shared answer: Not answered.

### Q10. Do we need remote storage or is local persistence sufficient?

Initial recommendation: Choose from the primary execution environment and recovery requirement.

Shared answer: Not answered.

### Q11. How should missing/corrupt assets be detected before expensive work?

Initial recommendation: Preflight reference media, checkpoint files, and metadata; detect LFS pointers.

Shared answer: Not answered.

### Q12. Should sensitive references and diagnostic artifacts have separate retention?

Initial recommendation: Apply explicit access and retention policies to voice references and logs.

Shared answer: Not answered.

## 10. Operations

### Q1. What is the primary supported installation and launch experience?

Initial recommendation: One documented command per supported environment with clear prerequisites.

Shared answer: Not answered; module introduction only.

### Q2. Should Docker be repaired and supported or retired?

Initial recommendation: Support it only if it is part of the agreed operating model.

Shared answer: Not answered; module introduction only.

### Q3. Which existing API endpoints and diagnostic scripts must survive?

Initial recommendation: Inventory real users; remove stale paths only after agreeing scope.

Shared answer: Not answered; module introduction only.

### Q4. What should full TypeScript conversion mean for Python ML engines?

Initial recommendation: Convert first-party Node/frontend and validate Python contracts; do not port PyTorch casually.

Shared answer: Not answered; module introduction only.

### Q5. How strict should compiler and lint gates be?

Initial recommendation: Require strict typing and forbid unexplained escape hatches.

Shared answer: Not answered; module introduction only.

### Q6. Where should secrets be configured and validated?

Initial recommendation: Centralize startup validation and keep provider secrets out of generated/public assets.

Shared answer: Not answered; module introduction only.

### Q7. Which events should trigger email or another notification?

Initial recommendation: Notify actionable failure/completion according to agreed noise tolerance.

Shared answer: Not answered; module introduction only.

### Q8. What information should an operator see when a run fails?

Initial recommendation: Job ID, stage, typed cause, retry guidance, and artifact links with redacted secrets.

Shared answer: Not answered; module introduction only.

### Q9. How will required external services be checked?

Initial recommendation: Use explicit preflight and separate live contract checks from offline tests.

Shared answer: Not answered; module introduction only.

### Q10. Should every job failure produce a nonzero process exit?

Initial recommendation: Yes for failed batch execution; NoWork should be successful.

Shared answer: Not answered; module introduction only.

### Q11. How will dependencies and vendored engines be upgraded?

Initial recommendation: Pin reproducible versions and run representative contract/output checks before updates.

Shared answer: Not answered; module introduction only.

### Q12. What cutover and rollback evidence is required?

Initial recommendation: Demonstrate agreed outputs, recovery, publishing behavior, and operating cost before retiring the old path.

Shared answer: Not answered; module introduction only.
