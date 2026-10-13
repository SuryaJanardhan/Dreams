# Round three — 30 workflow and refactor MCQs

Status: recommended option A accepted for all 30 questions by the user’s instruction to follow the list, followed by explicit authorization to start refactoring. Earlier round-two overrides remain binding. The interactive MCQs in the chat provide the complete wording.

This round preserves custom generated animations, 1080×1920 at 60 fps, two total generation attempts, all-platform publishing attempts, provider-based link verification, Sheet PAUSED control, in-job-only finalization, and infrastructure caching.

| Q | Decision | A — recommended | Alternatives | Shared answer |
| --- | --- | --- | --- | --- |
| 1 | Tasks per run | One valid task, skipping invalid rows first | Drain eligible queue within budget; or up to two valid tasks | A accepted |
| 2 | Twice-daily IST times | 11:30 AM and 11:30 PM | 8:30 AM/PM; or 6:30 AM/PM | A accepted |
| 3 | Time budget | 120 minutes including 10-minute finalization reserve | 60 minutes with reserve; or existing 340-minute ceiling with reserve | A accepted |
| 4 | Overlapping triggers | Preserve active job and allow one pending run to re-check state | Skip extra triggers | A accepted |
| 5 | Stale Processing | Next scheduled preflight marks interrupted, pauses, emails, and does no new work | Ignore row and move on; or exit without changes for manual investigation | A accepted |
| 6 | Deliberate incident recovery | User clears pause; failed/partial rows remain blocked unless explicitly returned to Not Posted | Clear pause and automatically regenerate failed task | A accepted |
| 7 | Supplied narration input | Separate optional Narration column with Idea/Description | Existing Scripts column; or explicit Input Mode | A accepted |
| 8 | Narration duration tolerance | 55–65 seconds with bounded correction | 50–70 seconds; or exactly 60 with duration adjustment | A accepted |
| 9 | Invalid row state | Invalid plus clear remark, continue in order | Keep Not Posted and revisit each run | A accepted |
| 10 | Sheet progress detail | Current/last-completed stages, timestamps, remarks, platform outcomes as received | Beginning/end only; or every log line | A accepted |
| 11 | Lost Sheet writes | Stop new side effects, bounded state-write attempts and incident email; preserve in-flight results where possible | Continue production and rely on email | A accepted |
| 12 | Uncertain upload | Unknown; query provider state without republishing, pause if unverified | Failed without checking acceptance | A accepted |
| 13 | Animation drawing runtime | Typed HTML/SVG + GSAP in isolated browser | Canvas TypeScript; or React/TSX frame compositions | A accepted |
| 14 | Generated scene scope | Independent explanation scenes assembled internally by renderer | One whole-reel animation module; or AI chooses scope | A accepted |
| 15 | Frame-time behavior | Explicit renderAt(time), independent of wall-clock/timer/random drift | Simulate callback-based playback from start | A accepted |
| 16 | Word/beat timing | AI names word anchors; trusted mapping resolves actual AssemblyAI times | AI guesses timestamps then validation checks | A accepted |
| 17 | Generated dependencies | Locally bundled approved libraries only | Automatic allowlisted installs; or arbitrary CDN libraries | A accepted |
| 18 | Visual assets | Bundled fonts/icons and local SVG, no remote fetching | Curated local illustrations; or remote/generated images | A accepted |
| 19 | Caption ownership | Trusted timed overlay with reserved area | AI scene implements captions | A accepted |
| 20 | Cover | Keep 0.5-second silent cover, derive offsets once | Remove intro; or topic-specific first frame with no added silence | A accepted |
| 21 | BGM | Existing asset with speech-aware ducking and mix validation | Existing fixed 20% setting; or remove BGM | A accepted |
| 22 | Safe areas | Reserve captions/platform overlays, check text sizes and clipping | Edge-to-edge scenes accepting overlap/cropping | A accepted |
| 23 | Visual failure gate | One repair within two total attempts, then pause without publication | Warn and publish valid media file | A accepted |
| 24 | Scene repair | Repair rejected scene using code, concrete errors and sampled evidence | Regenerate all scenes; or regenerate narration/content too | A accepted |
| 25 | Config validation | All required settings/assets before task claim | Validate only at each stage | A accepted |
| 26 | Email outcomes | Success, handled failure/partial and cancellation with links/context; empty queue silent | Failure/cancellation only; or every stage | A accepted |
| 27 | Email failure | One retry, record notification error, keep verified publication outcome | Pause production for missing notification even after successful publication | A accepted |
| 28 | Cleanup failure | Keep verified publication result, flag Cleanup Failed, pause and notify | Warning only, continue new production | A accepted |
| 29 | CI refactor gates | Strict typing, meaningful offline tests and short media/render fixtures | Build/syntax only; or additional live provider checks per change | A accepted |
| 30 | Legacy deletion | Delete proven-unused runtime paths after dependency review and replacement checks | Archive unsupported code; or retain compatibility forever | A accepted |

## Scope notes

- Provider status queries and bounded progress/email writes are not automatic upload retries. No repeat publication is authorized.
- The accepted two-attempt limit applies to generation/repair stages; publication submission retry policy stays off.
- Stale Processing handling runs only on a later scheduled preflight if selected; it does not create an independent incident-reporting workflow.
- A finalization reserve is a proposed operational target, not proof that the 60 fps render fits the CPU or free-tier budget.
- Strong typing constrains the generated module interface; its runtime data/code still requires actual validation and isolation.
- Caption/layout frame checks are heuristics and cannot establish complete visual or factual correctness.
