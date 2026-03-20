import { describe, it, expect } from 'vitest';
import { validateSpeakerTimestamps, getSamplePlaybackDuration, findLongestTurn } from './audioProcessing';
import type { Speaker, TranscriptEntry } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeSpeaker(id: string, timestamp: number): Speaker {
  return { id, label: `Speaker ${id}`, name: '', role: '', company: '', color: '#000', timestamp };
}

function makeEntry(
  id: string,
  speakerId: string,
  startTime: number,
  endTime: number
): TranscriptEntry {
  return { id, speakerId, text: 'test', startTime, endTime };
}

// ─────────────────────────────────────────────────────────────────────────────
// findLongestTurn
// ─────────────────────────────────────────────────────────────────────────────

describe('findLongestTurn', () => {
  it('returns null for an empty transcript', () => {
    expect(findLongestTurn('sp1', [])).toBeNull();
  });

  it('returns null when the speaker has no entries', () => {
    const transcript = [makeEntry('t1', 'sp2', 0, 5)];
    expect(findLongestTurn('sp1', transcript)).toBeNull();
  });

  it('returns the single turn when the speaker has one entry', () => {
    const transcript = [
      makeEntry('t1', 'sp1', 2, 6),
      makeEntry('t2', 'sp2', 7, 10),
    ];
    expect(findLongestTurn('sp1', transcript)).toEqual({ startTime: 2, endTime: 6 });
  });

  it('picks the longest contiguous turn among multiple', () => {
    const transcript = [
      makeEntry('t1', 'sp1', 0, 2),   // turn 1: 0-2 (2s)
      makeEntry('t2', 'sp2', 3, 5),
      makeEntry('t3', 'sp1', 6, 10),  // turn 2 start: 6-10
      makeEntry('t4', 'sp1', 10, 15), // turn 2 cont: 10-15 (total 6-15 = 9s)
      makeEntry('t5', 'sp2', 16, 20),
    ];
    expect(findLongestTurn('sp1', transcript)).toEqual({ startTime: 6, endTime: 15 });
  });

  it('handles the speaker being the last in the transcript', () => {
    const transcript = [
      makeEntry('t1', 'sp2', 0, 5),
      makeEntry('t2', 'sp1', 6, 12),
    ];
    expect(findLongestTurn('sp1', transcript)).toEqual({ startTime: 6, endTime: 12 });
  });

  it('handles consecutive entries from the same speaker (multi-entry turn)', () => {
    const transcript = [
      makeEntry('t1', 'sp1', 0, 4),
      makeEntry('t2', 'sp1', 5, 12),
    ];
    expect(findLongestTurn('sp1', transcript)).toEqual({ startTime: 0, endTime: 12 });
  });

  it('handles unsorted transcript entries', () => {
    const transcript = [
      makeEntry('t2', 'sp2', 5, 8),
      makeEntry('t1', 'sp1', 0, 4),  // out of order
    ];
    expect(findLongestTurn('sp1', transcript)).toEqual({ startTime: 0, endTime: 4 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateSpeakerTimestamps
// ─────────────────────────────────────────────────────────────────────────────

describe('validateSpeakerTimestamps', () => {
  it('returns the speakers unchanged when the transcript is empty', () => {
    const speakers = [makeSpeaker('sp1', 0)];
    const result = validateSpeakerTimestamps(speakers, []);
    expect(result.data).toEqual(speakers);
    expect(result.confidence).toBe(1.0);
  });

  it('returns confidence 1.0 when all timestamps are accurate', () => {
    const speakers = [makeSpeaker('sp1', 0), makeSpeaker('sp2', 5)];
    const transcript = [
      makeEntry('t1', 'sp1', 0, 3),
      makeEntry('t2', 'sp2', 5, 8),
    ];
    const result = validateSpeakerTimestamps(speakers, transcript);
    expect(result.confidence).toBe(1.0);
    expect(result.warnings).toHaveLength(0);
  });

  it('corrects an out-of-bounds timestamp and emits a warning', () => {
    const speakers = [makeSpeaker('sp1', 999)];
    const transcript = [makeEntry('t1', 'sp1', 2, 5)];
    const result = validateSpeakerTimestamps(speakers, transcript);
    expect(result.data[0]!.timestamp).toBe(2);
    expect(result.warnings.some((w) => w.includes('out of bounds'))).toBe(true);
    expect(result.confidence).toBeLessThan(1.0);
  });

  it('corrects a hallucinated timestamp (large mismatch) and emits a warning', () => {
    // TIMESTAMP_MISMATCH_THRESHOLD_S = 3; using a 10s diff
    const speakers = [makeSpeaker('sp1', 0)];
    const transcript = [makeEntry('t1', 'sp1', 10, 15)];
    const result = validateSpeakerTimestamps(speakers, transcript);
    expect(result.data[0]!.timestamp).toBe(10);
    expect(result.warnings.some((w) => w.includes('Correcting'))).toBe(true);
    expect(result.confidence).toBeLessThan(1.0);
  });

  it('does not modify a speaker not found in the transcript', () => {
    const speakers = [makeSpeaker('sp-missing', 5)];
    const transcript = [makeEntry('t1', 'sp-other', 0, 3)];
    const result = validateSpeakerTimestamps(speakers, transcript);
    expect(result.data[0]!.timestamp).toBe(5);
  });

  it('always corrects timestamp to best turn start even for small mismatches', () => {
    // speaker.timestamp is 1s off (within old 3s threshold) – should still correct
    const speakers = [makeSpeaker('sp1', 1)];
    const transcript = [makeEntry('t1', 'sp1', 2, 8)];
    const result = validateSpeakerTimestamps(speakers, transcript);
    expect(result.data[0]!.timestamp).toBe(2);
    // Small mismatch: no warning, full confidence
    expect(result.warnings).toHaveLength(0);
    expect(result.confidence).toBe(1.0);
  });

  it('uses the longest turn start, not the first entry start', () => {
    const speakers = [makeSpeaker('sp1', 0)];
    const transcript = [
      makeEntry('t1', 'sp1', 0, 1),    // short first turn (1s)
      makeEntry('t2', 'sp2', 2, 5),
      makeEntry('t3', 'sp1', 6, 16),   // long second turn (10s)
      makeEntry('t4', 'sp2', 17, 20),
    ];
    const result = validateSpeakerTimestamps(speakers, transcript);
    // Should pick the longer turn starting at 6, not the first at 0
    expect(result.data[0]!.timestamp).toBe(6);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getSamplePlaybackDuration
// ─────────────────────────────────────────────────────────────────────────────

describe('getSamplePlaybackDuration', () => {
  it('returns the fallback when the speaker has no transcript entries', () => {
    const duration = getSamplePlaybackDuration('sp-missing', [], 10);
    expect(duration).toBe(10);
  });

  it('returns the duration of the longest contiguous turn', () => {
    const transcript = [
      makeEntry('t1', 'sp1', 0, 4),
      makeEntry('t2', 'sp2', 6, 10),
    ];
    const duration = getSamplePlaybackDuration('sp1', transcript, 10);
    expect(duration).toBe(4); // single turn: 0-4
  });

  it('uses the full contiguous span when speaker has consecutive entries', () => {
    const transcript = [
      makeEntry('t1', 'sp1', 0, 4),
      makeEntry('t2', 'sp1', 5, 12),
    ];
    const duration = getSamplePlaybackDuration('sp1', transcript, 10);
    expect(duration).toBe(12); // contiguous turn: 0-12
  });

  it('returns at least 1 second for the gap case', () => {
    const transcript = [
      makeEntry('t1', 'sp1', 5, 5.5),
      makeEntry('t2', 'sp2', 5.1, 6),
    ];
    const duration = getSamplePlaybackDuration('sp1', transcript, 10);
    expect(duration).toBeGreaterThanOrEqual(1);
  });

  it('uses the custom fallback value', () => {
    const duration = getSamplePlaybackDuration('sp-none', [], 20);
    expect(duration).toBe(20);
  });

  it('picks the longest turn when speaker has multiple turns', () => {
    const transcript = [
      makeEntry('t1', 'sp1', 0, 2),    // turn 1: 2s
      makeEntry('t2', 'sp2', 3, 5),
      makeEntry('t3', 'sp1', 6, 10),   // turn 2: 4s (longest)
      makeEntry('t4', 'sp2', 11, 15),
    ];
    const duration = getSamplePlaybackDuration('sp1', transcript, 10);
    expect(duration).toBe(4); // longest turn: 6-10
  });
});
