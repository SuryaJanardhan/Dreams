# Main automation implementation

The production entry point is `src/automation/main.ts`. It composes deep modules through `runWorkflow`; provider clients, prompts, browser operations, FFmpeg commands, and Sheet transport stay private to their modules.

## Active stages

| Stage           | Module                              | Durable result                                                                           |
| --------------- | ----------------------------------- | ---------------------------------------------------------------------------------------- |
| Initialization  | `workspace`, `sheets`, `operations` | Claimed task and isolated workspace                                                      |
| Research        | `research`                          | Summary, source links, and evidence mode                                                 |
| Content         | `content`                           | Detected type, narration, semantic beats, and platform copy                              |
| Visual planning | `visual-planning`                   | Continuous `VisualStory`, persistent world, word anchors, camera, assets, and primitives |
| Assets          | `assets`                            | Decoded and multimodally validated job-local images                                      |
| Voice           | `voice`                             | Validated 24 kHz narration from the approved reference                                   |
| Captions        | `captions`                          | Actual-word timings and timed beats                                                      |
| Rendering       | `rendering`                         | Deterministic white-diagram master with captions and audio mix                           |
| Quality         | `quality`                           | Sampled-frame multimodal review and one targeted plan repair                             |
| Publishing      | `publishing`                        | Three persisted provider outcomes and canonical links                                    |
| Finalization    | `workflow`, `sheets`, `email`       | Cleanup, pause state, final progress, and notification                                   |

The former generated-scene-code validator and scene contract were removed. Browser rendering now interprets validated data only. See [CONTINUOUS_VISUAL_SYSTEM.md](CONTINUOUS_VISUAL_SYSTEM.md) for the persistent scene graph, illustration kit, motion presets, connector routing, and camera model.

## Sheet contract

The task tab accepts aliases documented in `src/automation/sheets/index.ts`. `Idea`, `Title`, or `Topic` plus `Status` are required. Only `Not Posted` is eligible. Optional inputs are `Description`/`Context`, `Narration`/`Script`, `Type`, `Audience`, and comma/newline-separated `Source URLs`.

`AutomationControl` contains the persistent `PAUSED` flag. `PrimitiveReview` stores generated primitive specifications, validation status, a `Promote` checkbox, review timestamp, and notes. Checked primitives are parsed and revalidated on a later run before they enter the trusted registry. Email contains an inline preview and a button opening that tab.

## Typed creative contracts

`domain.ts` defines the boundaries between tasks, research, story plans, visual plans, assets, narration, captions, rendered media, and publication outcomes. Zod validates all AI/provider responses. Stage-critical outputs become distinct types; the renderer cannot consume arbitrary prompt text or executable code.

Visual stories use 900×1250 world coordinates inside the 1080×1920 master. Every object has a stable ID, illustrated component kind, semantic color, and initial box. One global timeline references exact narration phrases, which resolve to final AssemblyAI word timings. Objects persist across beats, and position changes require interpolated `reflow` actions. The validator rejects invalid lifecycle, beat ordering, overlap, missing references, unknown assets/primitives, late opening motion, unsafe camera targets, and out-of-bounds shapes.

## External assets

The asset planner uses Gemini Google Search grounding through the existing visual Gemini key. Candidate pages must be user-provided or present in grounding results. Official pages are preferred; non-official candidates require explicit reuse evidence. The downloader accepts only public HTTPS hostnames and PNG/JPEG/WebP content, caps downloads at 8 MB, requires at least 600×400 resolution, normalizes with Sharp, then runs a multimodal subject/feature/crop review. One replacement attempt is allowed.

## Rendering and audio

Playwright builds trusted organic SVG illustrations and evaluates every frame from narration time. The pure timeline engine applies stable object lifecycle, easing, internal component actions, collision-aware curved connectors, smooth reflow, semantic color blending, and restrained camera framing. Deterministic sampled-frame gates inspect the diagram separately from captions and check overflow, density, dynamic geometry, blank output, continuity, and meaningful explanation changes.

FFmpeg encodes H.264 at 1080×1920/60 fps. Narration is the duration authority. Background music is mixed quietly with voice ducking. Up to four rate-limited soft cues mark transfers or mutations. The encoded master must contain audio, match duration/resolution/frame rate, stay under the true-peak threshold, and pass loudness measurement.

The quality stage extracts eight ordered frames into a contact sheet. Gemini grades technical meaning, sequence clarity, relevance, cleanliness, consistency, and caption readability. A failed review produces object/beat defects, repairs the declarative plan once, rerenders, and reviews again. A second failure stops publication.

## Operational guarantees

Progress is saved before and after every stage. Publication intent is checkpointed before provider side effects. All platform attempts finish unless progress persistence itself fails. Completion requires three published/ready results with IDs and canonical links.

Failures preserve known links, write `PAUSED`, clean the isolated workspace, remove Supabase staging only when no provider may still consume it, and email the stage, evidence mode, sources, grades, metrics, provider results, cleanup, and recovery links. Empty queues exit successfully. A stale `Processing` row is marked interrupted and never resumed or reposted automatically.

## Verification

Use Node 22 in production. The local repository may use system Chrome through `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`; otherwise Playwright uses its installed Chromium.

Run:

```bash
npm run compat
npm run typecheck:automation
npm test
npm run syntax
npm run smoke
```

Tests cover Sheet intake and primitive promotion, content rules, caption alignment, visual schemas, fixed geometry, real 1080×1920/60-fps fixture encoding, audio gates, workflow failure behavior, publication journaling, cleanup, and migration compatibility. Live Gemini grounding/vision, Qwen synthesis, AssemblyAI, SMTP, Sheets mutation, Supabase, and social publication still require one controlled Actions run with repository secrets.
