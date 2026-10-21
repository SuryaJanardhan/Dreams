# Refactor implementation and operation notes

## Active module boundaries

| Module     | Responsibility                                                                                                | Caller interface                |
| ---------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Workflow   | Serial stages, persisted progress, terminal reporting                                                         | runWorkflow(dependencies)       |
| Sheets     | Header aliases, ordered intake, stable IDs, control flag, summaries                                           | prepare / intake / save / pause |
| Content    | Structured narration, immutable supplied script, beat coverage, quality grade                                 | createContent                   |
| Voice      | CPU cloning, audible output, pacing and normalization                                                         | createVoice                     |
| Captions   | Mandatory AssemblyAI transcription and actual-word timing alignment                                           | createCaptions / alignCaptions  |
| Rendering  | Scene code validation, isolated SVG/HTML animation, sampled quality gates, frame encoding, captions and audio | renderVideo                     |
| Publishing | One attempt per platform, provider verification, partial results, consumer-safe staging cleanup               | Publisher.publish / cleanup     |
| Workspace  | Job-scoped generated files and bounded deletion                                                               | createWorkspace                 |
| Operations | Validated configuration, bounded requests/processes, cancellation, email                                      | Internal adapters               |

Animation and reel assembly now share the rendering module. Presenter, lip-sync, display capture, and interactive editor steps are absent from the production path. Legacy source remains pending migration review; this is not a claim that every existing JavaScript file has been converted.

## Sheet contract and recovery

Keep Idea (or Topic), optional Description and Narration (Scripts alias), and Status. Only Not Posted is eligible. Metadata columns are added automatically, including Task ID, current stage, last completed stage, grades, links, cleanup and serialized progress. Ambiguous headers fail preflight. Invalid rows are marked Invalid and skipped. Existing links block automatic re-publication.

AutomationControl contains PAUSED and REASON. A terminal failure pauses new content. If a previous run left Processing, the next run records interruption and pauses without continuing that task. Investigate provider IDs and links before changing a row or clearing the control flag. Never reset a partly published row blindly.

A normal failure/cancellation attempts Sheet writes, cleanup and email inside the job. A hard runner loss can prevent these. Setup failures have an in-job reporter, which also needs installed Node dependencies and valid credentials; failure before dependency installation cannot guarantee email or a control write. No independent watchdog was selected.

## Grades, cleanup and email

Content receives a deterministic quality grade; rendering checks sampled frames, text geometry and safe areas. Rejection triggers one repair/regeneration, then failure. These are heuristic gates, not proof of factual accuracy or aesthetic quality. Voice and caption validation reject silence/clipping, unsupported duration adjustment, missing words and invalid timings.

Every accepted platform outcome is persisted. Publishing finishes attempts for all three platforms before evaluating the overall result. Unknown remote consumers prevent staging deletion; retaining that object is reported as incomplete cleanup and pauses further processing. Local generated workspaces are deleted; source reference assets and model/dependency caches remain. Successful social posts are never deleted.

Email reports last started/completed stage, grades, provider states/IDs/links, cleanup results and Actions/Sheet locations. It gets two total delivery attempts. Notification failure does not turn successful publication into failed publication.

## Assets and engine limits

`assets/Base-audio.txt` was recovered automatically from `assets/Base-audio.mp3` using CPU speech transcription. VOICEBOX_REFERENCE_TEXT may override it. The reference says: “Whether it's a story, a lesson or an idea worth sharing, this is the voice that carries it home.”

The Qwen Base cloning path preserves the reference voice and English language. It does not accept a pretend delivery-instruction argument. Duration and levels are adjusted in audio processing when safe; out-of-range output regenerates once. There is no local production service or inference cache.

## Verification and remaining migration work

The offline suite exercises caption alignment, ordered row intake, partial publication, provider permalinks, staging retention, cleanup, failures, and three short actual frame-export fixtures (API, Load Balancer, Cache). Fixtures encode 1080p60 media with synthetic audio and local animation; they do not invoke Gemini, Voicebox, AssemblyAI or real social publication.

A complete voice-model synthesis, generated 60-second animation and live provider integration have not been run on this machine. Verify these on Actions with configured secrets before treating the migration as operationally proven. The 120-minute job budget reserves ten minutes for finalization; runtime at the selected resolution and model size needs measurement.

The legacy Docker entry point, old server/controller paths, composer UI and vendor presenter engines remain migration candidates. Existing user edits are preserved. Dependency pruning and deletion require caller review so retained tooling is not broken silently.

## Local verification record

Strict TypeScript build and whitespace checks passed. All 17 offline checks passed, covering captions, publishing, frame rendering, Sheets, workspace, cancellation and stale-job recovery. Actual short frame fixtures were encoded at 1080×1920/60 fps. Python engine syntax compiled, but model inference was not exercised. Compatible dependency fixes and an explicit Nodemailer 10.1 upgrade reduced the npm audit result from 12 advisories to zero at verification time. No real provider publication or live email was sent.

## Reliability and creative improvements

The quality update adds a Sheets-only eligibility/control gate before browser, FFmpeg and CPU engine setup. The production entry still rechecks eligibility after full preflight. An interrupted row is reported and paused without resuming or republishing. Control/setup reporting validates only its own credentials; dependency-installation failures and hard runner loss remain best-effort limitations.

Publication journal checkpoints persist staging ownership, active consumers and submission intent before remote side effects, then retain provider identifiers when known. A failed journal save stops further submissions. Staging deletion is recorded only after remote deletion succeeds. This is diagnostic state, not an automatic recovery/repost mechanism. No credentials or resumable-session URLs are written into the journal.

Typed finalization outcomes separate published posts from cleanup, durable persistence, pause and notification. Required persistence/cleanup failures make the Action fail even if every post was published. Notifications are recorded as pending before delivery, then sent/failed afterward. Email-only failure still does not change remote publication success. Task-ID write failures propagate as infrastructure incidents instead of marking valid rows Invalid.

Generated plans now include a shared example, payoff, object registry, colors and fixed 900×1310 object boxes. Independent custom AI scenes must expose their persistent object IDs and settle them into those boxes; sampled-frame validation rejects missing, resized or drifting objects. They must show causal diagram changes. Code restrictions cover more asynchronous/callback capabilities, CSS animations are disabled, and the one repair attempt gets a fresh browser. Sampled visual checks include more timeline/word anchors, text density, SVG readability and measurable motion.

Content receives both deterministic structural validation and a separate Gemini audit for clarity, technical accuracy, example usefulness and authenticity. Generic introductions, engagement bait, stage directions and prompt labels fail rather than merely lowering a score. This remains an automated quality heuristic, not independent fact verification.

Captions follow punctuation, pause boundaries and a conservative text budget, with a short pause hold and stable layout. The caption DOM updates only when its displayed state changes. Music fades in/out and retains voice ducking. Narration is checked for audible energy and clipping before processing. Voice duration is accepted naturally within 40–75 seconds without global tempo correction. The final mix disables limiter gain compensation, preserves encoding headroom and rejects encoded true peaks above −1.2 dB. Supplied narration keeps exact punctuation/wording. Stage timings, orchestrator/voice peak RSS and render/audio measurements are logged and saved with job progress for the real Actions benchmark.

Legacy runtime retirement and exact CPU/model dependency pinning remain follow-up work after a complete production integration run. Existing uncommitted legacy caller edits remain preserved. No additional provider, AI visual critic, output archive, presenter or automatic job recovery was introduced.

The first live quality run stopped before generation at a legacy Processing row without new progress JSON; Gmail also rejected its configured login. Missing legacy snapshots now produce an Interrupted diagnostic record with unknown outcomes and preserved existing links, never a resumed or reposted job. A previously persisted PAUSED flag still requires deliberate user recovery. SMTP credential rejection requires correcting GitHub email secrets; code cannot repair that credential.
