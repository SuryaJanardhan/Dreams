import type { Word } from "../domain.js";
export interface CaptionPhrase {
  words: Word[];
  start: number;
  end: number;
}
/** Stable phrases follow punctuation, spoken pauses and a conservative two-line text budget. */
export function captionPhrases(words: Word[]): CaptionPhrase[] {
  const phrases: CaptionPhrase[] = [];
  let current: Word[] = [];
  const flush = () => {
    const first = current[0],
      last = current.at(-1);
    if (first && last)
      phrases.push({ words: current, start: first.start, end: last.end });
    current = [];
  };
  for (const word of words) {
    const previous = current.at(-1);
    const characters =
      current.reduce((count, item) => count + item.text.length + 1, 0) +
      word.text.length;
    if (
      previous &&
      (word.start - previous.end > 0.4 ||
        characters > 34 ||
        current.length >= 6)
    )
      flush();
    current.push(word);
    if (/[.!?;,:]$/.test(word.text)) flush();
  }
  flush();
  return phrases;
}
export function captionAt(phrases: CaptionPhrase[], time: number): Word[] {
  const index = phrases.findIndex(
    (phrase, i) =>
      time >= phrase.start &&
      time < Math.min(phrase.end + 0.3, phrases[i + 1]?.start ?? Infinity),
  );
  return phrases[index]?.words ?? [];
}
