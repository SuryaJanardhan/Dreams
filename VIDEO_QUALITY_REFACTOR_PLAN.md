# Video Quality Refactor Plan

## Goal

Make the automated explainer produce a complete, understandable, visually composed short video whose spoken narration and captions agree. Preserve the current automated production flow and its approval-before-publishing gate. This document is a plan; no production workflow changes are authorized by writing it.

## What the local video showed

The inspected local render was technically valid H.264, 1080×1920, 60 fps, with AAC audio. It ran for about 48 seconds. The narration and captions now followed the generated script, and the end card compared JWTs with server-side sessions.

The remaining visible weaknesses were:

- Most of the canvas was empty. The main objects occupied a small area, with large gaps between objects and captions.
- The JWT and server illustrations stayed in nearly the same arrangement for much of the explanation. The session store appeared late, and the final comparison table arrived only near the end.
- Object labels and details were difficult to read at phone size. Some labels competed with the illustration inside their object box.
- The local voice fallback uses eSpeak. Its speech matched the script, but its synthetic sound is not a publish-quality substitute for the intended voice.
- Local fixture mode skips the AI visual-quality review. Its `AwaitingApproval` status and grade therefore must not be interpreted as production approval or as proof of equivalent review.

## Target workflow

```text
Sheet task
  → research and content
  → script quality gate
  → visual storyboard and layout validation
  → script-matched narration
  → captions aligned to actual speech
  → render
  → technical media checks
  → visual quality review
  → review approval
  → publishing
```

Every stage should consume a typed result from the previous stage. A failed provider call should either use the configured local fallback bridge or stop with a stage-specific reason. Do not label a local fixture run as publication-ready unless it used production-equivalent narration and visual review.

## Proposed module changes

### 1. Content and script

Keep the content planner responsible for narration, beats, and platform copy. Require beats to partition the spoken script exactly, preserve the task type and audience, and keep one concrete example through the explanation. Add a deterministic text-level quality gate before visual planning:

- opening states the exact confusion or question;
- each beat advances one causal step;
- no unsupported claims or generic filler;
- ending gives a usable choice or mental model;
- expected spoken duration is derived from word count and measured speech rate.

Do not silently invent fallback copy that changes meaning. If a platform copy field is absent, a deterministic copy derived from the approved title/script can be used, but it should be marked as generated fallback metadata.

### 2. Voice generation

Separate the voice provider from narration validation behind the existing voice-stage seam. Production should use the selected CPU voice model and save the exact synthesized narration used by rendering. Local fixture mode may use eSpeak for pipeline debugging, but must stamp the result as `fixture-voice` and prevent it from being treated as a production-quality voice.

Acceptance checks:

- synthesized speech contains the intended narration;
- duration is compatible with the generated script and configured target;
- no clipping, silence, or excessive trailing gaps;
- retain the selected voice/accent consistently between runs.

### 3. Captions

Keep ASR word timings as the source of timing truth. Align recognized words to the script; stop if they differ beyond the allowed correction threshold. Add a visual safe-area check after layout. Target short readable phrases, consistent line breaks, and no overlap with the main diagram or app chrome.

For local fixture runs, use the same ASR alignment if the key is configured. If not, use known script timings only with a visible fixture marker in metadata; do not describe those captions as speech-verified.

### 4. Visual planning

Keep the planner's typed `VisualStory` interface, but tighten its instructions around composition and transitions. For every beat, the planner should specify:

- a clear focal object and a readable causal change;
- approximate on-screen occupancy and phone-size label budget;
- how persistent objects move or change state;
- a purposeful entrance, transfer, reflow, focus, or hold;
- a clear visual result before progressing to the next beat.

The current valid-but-sparse result needs a stronger layout invariant. Require an explicit composition score or deterministic measurements for active canvas occupancy, object size, spacing, overlap, and text legibility. Do not fix sparse layouts by merely adding decorative objects. The JWT/session example should show the token moving through a service, the expiry/revocation consequence, the shared session store, then a readable side-by-side decision comparison.

### 5. Rendering and animation

Deepen the renderer behind its existing `renderVideo` interface. It should take a validated story and produce a continuous animation with stable object identity. Improve the current composition by:

- using the portrait canvas more deliberately while preserving caption-safe space;
- scaling primary objects and labels for phone viewing;
- keeping object labels and details within their boxes without clipping;
- animating state changes and transfers with visible travel and settled endpoints;
- making the comparison table a legible payoff rather than a tiny late appearance;
- maintaining the restrained white, black, and yellow visual system.

Keep technical checks for dimensions, frame rate, audio presence, duration, and encoded peak. The current local run completed these checks, but those checks alone do not certify design quality.

### 6. Visual quality review

Retain the sampled-frame review and repair loop, but judge the sequence as one explanation. The review should report specific fixable defects: tiny composition, unclear causality, repeated static frames, unreadable text, object drift, weak payoff, or captions obscuring meaning.

Add deterministic pre-review measures for:

- diagram occupancy and primary-object pixel size;
- per-beat visual change while allowing intentional quiet holds;
- caption contrast, size, and safe-area overlap;
- first and last frame content;
- script, audio, and caption duration agreement.

Do not automatically soften a failed check enough to pass a poor video. Each threshold should be calibrated against reviewed sample videos and stored fixtures.

### 7. Local fallback and fixture mode

Keep `LOCAL_FIXTURE_MODE` isolated from production. Make its output metadata state the voice source, caption timing source, AI fallback use, and whether visual review was actually performed. Its video belongs in `Dreams/output/` and must survive workspace cleanup.

The current file-based AI fallback bridge pauses on an LLM failure and waits for a structured response. Make the request self-contained by including the schema, full relevant context, and any image/frame input required by the requested operation. After a response is consumed, retain the request/response alongside the output for debugging without mixing it with production state.

## Delivery sequence

1. **Video audit fixture:** capture representative topic, narration, visual plan, captions, media checks, and sampled frames from the current local run.
2. **Composition first:** improve the JWT/session storyboard and renderer sizing; check phone-size frames before changing voice providers.
3. **Narration and caption fidelity:** use script-matched local narration, real word timings, and duration checks; mark fixture audio clearly.
4. **Quality gate:** calibrate occupancy, legibility, continuity, audio, and scene-change checks against reviewed rendered samples.
5. **Production run:** only after local samples meet the visual and audio criteria, run the production pipeline through approval. Publishing remains downstream of approval.

## Acceptance criteria

- The full narration is audible from beginning to end, and captions match the words and timing.
- The comparison is understandable without reading a long caption or guessing what the objects mean.
- Main objects and labels are comfortably readable on a phone screen.
- The diagram fills the portrait composition with intentional negative space; it does not leave most of the frame blank.
- Persistent objects retain identity, and visible transitions explain the causal relationship.
- The ending gives a clear decision/payoff and holds long enough to read.
- Automated checks reject broken or unreadable output, while allowing intentionally quiet beats.
- Fixture output is clearly marked as fixture output and is never confused with production approval.

## Known limits of the current sample

The current regenerated file is useful for exercising the local pipeline. It is not ready to publish: the layout remains sparse, the visual sequence is too repetitive, eSpeak is synthetic, and fixture mode bypasses the AI visual review. The next implementation pass should start with composition and storyboard quality, then revisit voice quality after the local model/runtime constraints are resolved.
