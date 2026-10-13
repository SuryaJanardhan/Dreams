# Refactor implementation and operation notes

## Active module boundaries

| Module | Responsibility | Caller interface |
| --- | --- | --- |
| Workflow | Serial stages, persisted progress, terminal reporting | runWorkflow(dependencies) |
| Sheets | Header aliases, ordered intake, stable IDs, control flag, summaries | prepare / intake / save / pause |
| Content | Structured narration, immutable supplied script, beat coverage, quality grade | createContent |
| Voice | CPU cloning, audible output, pacing and normalization | createVoice |
| Captions | Mandatory AssemblyAI transcription and actual-word timing alignment | createCaptions / alignCaptions |
| Rendering | Scene code validation, isolated SVG/HTML animation, sampled quality gates, frame encoding, captions and audio | renderVideo |
| Publishing | One attempt per platform, provider verification, partial results, consumer-safe staging cleanup | Publisher.publish / cleanup |
| Workspace | Job-scoped generated files and bounded deletion | createWorkspace |
| Operations | Validated configuration, bounded requests/processes, cancellation, email | Internal adapters |

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
