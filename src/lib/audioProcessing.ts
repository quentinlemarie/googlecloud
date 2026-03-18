import type { Speaker, TranscriptEntry, ValidationResult } from '../types';
import { TIMESTAMP_MISMATCH_THRESHOLD_S } from './constants';

/**
 * Validates speaker timestamps against the transcript.
 * - Detects out-of-bounds timestamps (> last transcript entry end time)
 * - Detects Gemini hallucinations (timestamp differs from transcript by > threshold)
 * - Corrects timestamps to the actual first utterance of each speaker
 * - Calculates playback duration based on the next speaker's start time
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

  // Build a map: speakerId → first actual transcript entry
  const firstEntryBySpeaker = new Map<string, TranscriptEntry>();
  for (const entry of transcript) {
    if (!firstEntryBySpeaker.has(entry.speakerId)) {
      firstEntryBySpeaker.set(entry.speakerId, entry);
    }
  }

  const corrected = speakers.map((speaker): Speaker => {
    const firstEntry = firstEntryBySpeaker.get(speaker.id);

    if (!firstEntry) {
      // Speaker not found in transcript – keep as-is
      return speaker;
    }

    const actualStart = firstEntry.startTime;
    const claimedTimestamp = speaker.timestamp;

    // Check for out-of-bounds
    if (claimedTimestamp > lastEndTime) {
      warnings.push(
        `Speaker "${speaker.id}" timestamp ${claimedTimestamp}s is out of bounds (audio ends at ${lastEndTime}s). Correcting.`
      );
      confidence -= 0.1;
      return { ...speaker, timestamp: actualStart };
    }

    // Check for significant mismatch (possible hallucination)
    const diff = Math.abs(claimedTimestamp - actualStart);
    if (diff > TIMESTAMP_MISMATCH_THRESHOLD_S) {
      warnings.push(
        `Speaker "${speaker.id}" timestamp ${claimedTimestamp}s differs from first transcript entry by ${diff.toFixed(1)}s. Correcting.`
      );
      confidence -= 0.05;
      return { ...speaker, timestamp: actualStart };
    }

    return speaker;
  });

  return {
    data: corrected,
    confidence: Math.max(0, confidence),
    warnings,
  };
}

/**
 * Calculates the playback duration for a speaker audio sample.
 * Uses the gap to the next speaker's start time so the snippet
 * plays the speaker's complete turn rather than a fixed window.
 *
 * @param speakerId  Speaker whose sample we want
 * @param transcript Full transcript
 * @param fallback   Duration to use when no gap can be calculated (default 10s)
 */
export function getSamplePlaybackDuration(
  speakerId: string,
  transcript: TranscriptEntry[],
  fallback = 10
): number {
  const entries = transcript.filter((e) => e.speakerId === speakerId);
  if (entries.length === 0) return fallback;

  const firstEntry = entries[0]!;
  const startTime = firstEntry.startTime;

  // Find the first entry belonging to a DIFFERENT speaker after this one
  const sortedAll = [...transcript].sort((a, b) => a.startTime - b.startTime);
  const nextOtherEntry = sortedAll.find(
    (e) => e.speakerId !== speakerId && e.startTime >= startTime
  );

  if (!nextOtherEntry) {
    // Last speaker – use their final endTime
    const lastEntry = entries[entries.length - 1]!;
    return Math.max(fallback, lastEntry.endTime - startTime);
  }

  return Math.max(1, nextOtherEntry.startTime - startTime);
}
