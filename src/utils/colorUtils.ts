import { SPEAKER_COLORS } from '../lib/constants';

/**
 * Deterministically maps a speaker ID to a colour from the palette.
 * Uses a simple DJB2-style hash so the same ID always returns the same colour.
 */
export function getSpeakerColor(speakerId: string): string {
  let hash = 5381;
  for (let i = 0; i < speakerId.length; i++) {
    hash = (hash * 33) ^ speakerId.charCodeAt(i);
  }
  const index = Math.abs(hash) % SPEAKER_COLORS.length;
  return SPEAKER_COLORS[index];
}
