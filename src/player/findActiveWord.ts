import type { TranscriptWord } from '../types/transcriptWord';

/**
 * Binary search through a sorted (by start time) words array to find the
 * word whose time range contains `time`. Returns the word ID or null.
 *
 * Assumption: words are sorted by `start` time (ascending). This is true for
 * words extracted from Whisper API responses.
 */
export function findActiveWord(
  words: TranscriptWord[],
  time: number,
): string | null {
  if (words.length === 0) return null;

  let low = 0;
  let high = words.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const word = words[mid];

    if (time < word.start) {
      high = mid - 1;
    } else if (time >= word.end) {
      low = mid + 1;
    } else {
      return word.id;
    }
  }

  return null;
}
