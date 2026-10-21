import type { MockScene } from "./domain.js";

function normalized(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function includesConcept(text: string, concept: string) {
  return normalized(text).includes(normalized(concept));
}

/** Structural retention gate for the comparison format; rejects generic or visually idle plans. */
export function validateComparisonRetention(
  conceptA: string,
  conceptB: string,
  scenes: MockScene[],
) {
  const first = scenes[0];
  const last = scenes.at(-1);
  if (!first || !last) throw new Error("Comparison has no timed scenes");
  const duration = last.end - first.start;
  if (duration < 25 || duration > 40)
    throw new Error(
      "Comparison duration must remain between 25 and 40 seconds",
    );
  const opening = scenes
    .filter((scene) => scene.group === 0)
    .map((scene) => scene.text)
    .join(" ");
  if (
    !includesConcept(opening, conceptA) ||
    !includesConcept(opening, conceptB)
  )
    throw new Error("Comparison opening must name both concepts");
  if (scenes.some((scene) => scene.end - scene.start > 6))
    throw new Error(
      "A visual beat remains unchanged for more than six seconds",
    );
  if (!scenes.some((scene) => scene.group === 4))
    throw new Error("Comparison needs a demonstrated relatable scenario");
  const memoryRule = scenes
    .filter((scene) => scene.group === 5)
    .map((scene) => scene.text)
    .join(" ");
  if (
    !includesConcept(memoryRule, conceptA) ||
    !includesConcept(memoryRule, conceptB)
  )
    throw new Error("Final memory rule must distinguish both concepts");
  return {
    durationSeconds: duration,
    sceneCount: scenes.length,
    longestSceneSeconds: Math.max(
      ...scenes.map((scene) => scene.end - scene.start),
    ),
  };
}
