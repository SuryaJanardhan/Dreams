# 0001 — Generate custom animation code and export explicit frames

Date: 12 October 2026
Status: Accepted direction; implementation contract open.

## Context

The future product is an entirely automated Actions CPU pipeline producing full-screen educational animation, narration, and word captions. It excludes a presenter, manual editor, and screen recording. The renderer must support explanations that vary by technical topic.

## Decision

The user selected AI-generated custom animation code for each video, validated before frame-by-frame rendering. Output profile is 1080×1920 at 60 fps. The rendering module owns this complexity behind a small render interface. Language/runtime, assets, dependency policy, and frame-time contract remain open for the next interview.

## Alternatives

Typed reusable scene templates were recommended for predictable execution but were not selected. A hybrid template/custom-code renderer was offered but not selected.

## Consequences

The pipeline has greater visual freedom and inherits code-validation, temporal-state, dependency, and execution-cost problems. Frame rendering must use narration-aligned explicit times. Two total scene attempts permit one repair. Three topic fixtures, timing checks, and sampled-frame checks gate acceptance. These checks do not guarantee factual correctness or detect every visual flaw.

No implementation, rendering library, unbounded generated-code permissions, or performance promise is approved by this decision.
