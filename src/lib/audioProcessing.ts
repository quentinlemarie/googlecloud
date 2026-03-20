import type { Speaker, TranscriptEntry, ValidationResult } from '../types';
import { TIMESTAMP_MISMATCH_THRESHOLD_S } from './constants';

/**
 * Finds the longest contiguous turn (run of consecutive entries in time-order)
 * for a given speaker. A "turn" is a sequence of entries where no other speaker
 * talks in between, giving a clean single-speaker segment.
 *
 * Returns the start and end times, or null if the speaker has no entries.
 */
export function findLongestTurn(
  speakerId: string,
  transcript: TranscriptEntry[]
): { startTime: number; endTime: number } | null {
  if (transcript.length === 0) return null;

  const sorted = [...transcript].sort((a, b) => a.startTime - b.startTime);

  let bestStart = -1;
  let bestEnd = -1;
  let bestDuration = -1;

  let turnStart = -1;
  let turnEnd = -1;

  for (const entry of sorted) {
    if (entry.speakerId === speakerId) {
      if (turnStart < 0) {
        turnStart = entry.startTime;
      }
      turnEnd = entry.endTime;
    } else {
      if (turnStart >= 0) {
        const duration = turnEnd - turnStart;
        if (duration > bestDuration) {
          bestStart = turnStart;
          bestEnd = turnEnd;
          bestDuration = duration;
        }
        turnStart = -1;
        turnEnd = -1;
      }
    }
  }

  // Handle the last run
  if (turnStart >= 0) {
    const duration = turnEnd - turnStart;
    if (duration > bestDuration) {
      bestStart = turnStart;
      bestEnd = turnEnd;
    }
  }

  if (bestStart < 0) return null;
  return { startTime: bestStart, endTime: bestEnd };
}

/**
 * Validates speaker timestamps against the transcript.
 * - Detects out-of-bounds timestamps (> last transcript entry end time)
 * - Detects Gemini hallucinations (timestamp differs from transcript by > threshold)
 * - Always corrects timestamps to the start of the longest contiguous turn
 *   for each speaker, ensuring the sample plays a distinguishable solo segment
 *
 * Returns validated speakers and a confidence score.
 */
export function validateSpeakerTimestamps(
  speakers: Speaker[],
  transcript: TranscriptEntry[]
): ValidationResult<Speaker[]> {
  const warnings: string[] = [];
  let confidence = 1.0;

  if (transcript.length === 0) {
    return { data: speakers, confidence, warnings };
  }

  const lastEndTime = Math.max(...transcript.map((e) => e.endTime));

  const corrected = speakers.map((speaker): Speaker => {
    const bestTurn = findLongestTurn(speaker.id, transcript);

    if (!bestTurn) {
      // Speaker not found in transcript – keep as-is
      return speaker;
    }

    const bestStart = bestTurn.startTime;
    const claimedTimestamp = speaker.timestamp;

    // Check for out-of-bounds
    if (claimedTimestamp > lastEndTime) {
      warnings.push(
        `Speaker "${speaker.id}" timestamp ${claimedTimestamp}s is out of bounds (audio ends at ${lastEndTime}s). Correcting.`
      );
      confidence -= 0.1;
    } else {
      // Check for significant mismatch (possible hallucination)
      const diff = Math.abs(claimedTimestamp - bestStart);
      if (diff > TIMESTAMP_MISMATCH_THRESHOLD_S) {
        warnings.push(
          `Speaker "${speaker.id}" timestamp ${claimedTimestamp}s differs from best transcript segment by ${diff.toFixed(1)}s. Correcting.`
        );
        confidence -= 0.05;
      }
    }

    // Always use the transcript-derived best sample start
    return { ...speaker, timestamp: bestStart };
  });

  return {
    data: corrected,
    confidence: Math.max(0, confidence),
    warnings,
  };
}

/**
 * Calculates the playback duration for a speaker audio sample.
 * Uses the longest contiguous turn so the snippet plays a clean,
 * distinguishable single-speaker segment rather than a fixed window.
 *
 * @param speakerId  Speaker whose sample we want
 * @param transcript Full transcript
 * @param fallback   Duration to use when no turn can be found (default 10s)
 */
export function getSamplePlaybackDuration(
  speakerId: string,
  transcript: TranscriptEntry[],
  fallback = 10
): number {
  const bestTurn = findLongestTurn(speakerId, transcript);
  if (!bestTurn) return fallback;

  return Math.max(1, bestTurn.endTime - bestTurn.startTime);
}
