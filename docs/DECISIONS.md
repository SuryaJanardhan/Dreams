# Effective decisions

Updated 22 October 2026. This file replaces earlier visual-pipeline choices. The complete architecture and acceptance criteria are in [MAIN_VISUAL_PIPELINE_PLAN.md](MAIN_VISUAL_PIPELINE_PLAN.md).

## Product

- Google Sheets is the only queue. `Topic` and `Status` are required; `Type`, `Context`, `Audience`, `Source URLs`, and supplied narration are optional.
- Topics may be questions, comparisons, interview questions, or scenarios. AI infers the structure unless `Type` overrides it.
- Videos explain software-engineering topics in natural, simple Indian English through one concrete example.
- The opening states the actual confusion. Greetings, hype hooks, engagement bait, fake experience, generic conclusions, logos, watermarks, intros, and cover cards are prohibited.
- Narration ends naturally between 35 and 65 seconds. The approved calm male Indian-English reference voice remains mandatory.

## Visual system

- The main visual identity is a white diagram canvas with black structure, blue active state, green success, yellow warning/question, and red failure.
- Each beat shows one primary idea and no more than seven meaningful objects.
- Captions contain 2–5 words, remain black, highlight the current word blue, and follow actual transcription timings.
- Motion explains causal changes. Ambient movement, particles, arbitrary zooms, and decorative backgrounds are prohibited.
- AI returns versioned declarative visual data. Trusted TypeScript renders every pixel. Generated JavaScript or TypeScript is never executed.
- AI may propose a declarative composite primitive from bounded shapes. It is validated and may be used for that job. It becomes reusable only after the user checks `Promote` in the `PrimitiveReview` Sheet tab.
- Diagrams are preferred. External images are used only when a real interface/product materially helps; official sources come first, and every image must pass source, rights, decoding, resolution, crop, and multimodal relevance checks.

## Research and quality

- Gemini Google Search grounding supplies current source links. User-provided source URLs are included.
- If grounded research fails, Gemini may produce a stable-knowledge best-effort answer; the job records that mode and does not invent citations.
- Source links are saved with the job and stay off-screen.
- Each creative unit receives an initial attempt and one targeted repair. A repeated failure stops and pauses production.
- Deterministic schema, geometry, density, caption, audio, and media checks run before a multimodal review of sampled frames.

## Audio and publication

- The voice stays dominant. Owned background music is quiet and ducked; rare soft cues mark meaningful transfers or state changes.
- One 1080×1920, 60-fps master is published to YouTube Shorts, Instagram Reels, and Facebook Reels with platform-specific descriptions.
- Publishing attempts all three platforms and records each result. `Completed` requires provider-confirmed publication, ID, and canonical link for all three.
- Any failure or partial result pauses future scheduled work, safely cleans temporary/staging data, preserves successful posts/links, and emails the complete outcome.
- Abrupt runner loss remains limited to the next-run stale-job detector because no independent paid watchdog was selected.

## Execution

- Production runs twice daily on CPU-only GitHub Actions with serialized concurrency.
- Model and dependency downloads may use infrastructure caches. Generated voice, media, and prompt outputs do not use cross-run caches.
- Healthy runs are fully automated. Manual action occurs only for incident recovery or optional primitive promotion.
