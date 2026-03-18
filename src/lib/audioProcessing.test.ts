import { describe, it, expect } from 'vitest';
import { validateSpeakerTimestamps, getSamplePlaybackDuration } from './audioProcessing';
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
});

// ─────────────────────────────────────────────────────────────────────────────
// getSamplePlaybackDuration
// ─────────────────────────────────────────────────────────────────────────────

describe('getSamplePlaybackDuration', () => {
  it('returns the fallback when the speaker has no transcript entries', () => {
    const duration = getSamplePlaybackDuration('sp-missing', [], 10);
    expect(duration).toBe(10);
  });

  it('returns the gap to the next different speaker', () => {
    const transcript = [
      makeEntry('t1', 'sp1', 0, 4),
      makeEntry('t2', 'sp2', 6, 10),
    ];
    const duration = getSamplePlaybackDuration('sp1', transcript, 10);
    expect(duration).toBe(6); // next speaker starts at 6
  });

  it('uses the last entry endTime when the speaker is the last one', () => {
    const transcript = [
      makeEntry('t1', 'sp1', 0, 4),
      makeEntry('t2', 'sp1', 5, 12),
    ];
    const duration = getSamplePlaybackDuration('sp1', transcript, 10);
    expect(duration).toBe(12); // lastEntry.endTime - firstEntry.startTime = 12 - 0
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
});
