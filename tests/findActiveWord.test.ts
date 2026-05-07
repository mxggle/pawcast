import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findActiveWord } from '../src/player/findActiveWord';
import type { TranscriptWord } from '../src/types/transcriptWord';

function word(id: string, start: number, end: number): TranscriptWord {
  return { id, text: id, start, end };
}

describe('findActiveWord', () => {
  it('returns null for empty words array', () => {
    assert.equal(findActiveWord([], 0), null);
    assert.equal(findActiveWord([], 5), null);
  });

  it('finds the only word when time is within range', () => {
    const words = [word('a', 0, 2)];
    assert.equal(findActiveWord(words, 0.5), 'a');
    assert.equal(findActiveWord(words, 0), 'a');
    assert.equal(findActiveWord(words, 1.999), 'a');
  });

  it('returns null when time is outside single word range', () => {
    const words = [word('a', 0, 2)];
    assert.equal(findActiveWord(words, -0.1), null);
    assert.equal(findActiveWord(words, 2.0), null);
    assert.equal(findActiveWord(words, 5), null);
  });

  it('finds the first word in a multi-word array', () => {
    const words = [word('a', 0, 2), word('b', 2, 4), word('c', 4, 6)];
    assert.equal(findActiveWord(words, 0.5), 'a');
    assert.equal(findActiveWord(words, 0), 'a');
    assert.equal(findActiveWord(words, 1.999), 'a');
  });

  it('finds the last word in a multi-word array', () => {
    const words = [word('a', 0, 2), word('b', 2, 4), word('c', 4, 6)];
    assert.equal(findActiveWord(words, 4.5), 'c');
    assert.equal(findActiveWord(words, 4), 'c');
    assert.equal(findActiveWord(words, 5.999), 'c');
  });

  it('finds a middle word', () => {
    const words = [word('a', 0, 2), word('b', 2, 4), word('c', 4, 6)];
    assert.equal(findActiveWord(words, 3.0), 'b');
    assert.equal(findActiveWord(words, 2.5), 'b');
    assert.equal(findActiveWord(words, 2.0), 'b');
    assert.equal(findActiveWord(words, 3.999), 'b');
  });

  it('returns null when time is in a gap between words', () => {
    const words = [word('a', 0, 1), word('b', 3, 4), word('c', 7, 8)];
    assert.equal(findActiveWord(words, 0.5), 'a');
    assert.equal(findActiveWord(words, 3.5), 'b');
    assert.equal(findActiveWord(words, 7.5), 'c');
    assert.equal(findActiveWord(words, 2.0), null);
    assert.equal(findActiveWord(words, 5.0), null);
    assert.equal(findActiveWord(words, 1.5), null);
  });

  it('returns null when time is before the first word', () => {
    const words = [word('a', 5, 10), word('b', 10, 15)];
    assert.equal(findActiveWord(words, 0), null);
    assert.equal(findActiveWord(words, 3), null);
    assert.equal(findActiveWord(words, -1), null);
  });

  it('returns null when time is after the last word', () => {
    const words = [word('a', 0, 5), word('b', 5, 10)];
    assert.equal(findActiveWord(words, 10), null);
    assert.equal(findActiveWord(words, 15), null);
    assert.equal(findActiveWord(words, 100), null);
  });

  it('handles large sorted word arrays (binary search correctness)', () => {
    const words: TranscriptWord[] = [];
    for (let i = 0; i < 1000; i++) {
      words.push(word(`w${i}`, i * 0.1, (i + 1) * 0.1));
    }
    assert.equal(findActiveWord(words, 0.05), 'w0');
    assert.equal(findActiveWord(words, 0.15), 'w1');
    assert.equal(findActiveWord(words, 49.95), 'w499');
    assert.equal(findActiveWord(words, 99.95), 'w999');
    assert.equal(findActiveWord(words, 0.100001), 'w1');
    assert.equal(findActiveWord(words, 0.099999), 'w0');
  });

  it('works with a single word not starting at zero', () => {
    const words = [word('x', 10, 20)];
    assert.equal(findActiveWord(words, 0), null);
    assert.equal(findActiveWord(words, 10), 'x');
    assert.equal(findActiveWord(words, 15), 'x');
    assert.equal(findActiveWord(words, 20), null);
  });

  it('handles adjacent words with zero gap', () => {
    const words = [word('a', 0, 3), word('b', 3, 6), word('c', 6, 9)];
    assert.equal(findActiveWord(words, 2.999), 'a');
    assert.equal(findActiveWord(words, 3.0), 'b');
    assert.equal(findActiveWord(words, 5.999), 'b');
    assert.equal(findActiveWord(words, 6.0), 'c');
  });
});
