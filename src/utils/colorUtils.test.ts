import { describe, it, expect } from 'vitest';
import { getSpeakerColor } from './colorUtils';
import { SPEAKER_COLORS } from '../lib/constants';

describe('getSpeakerColor', () => {
  it('returns a color from the palette for a given speaker ID', () => {
    const color = getSpeakerColor('speaker-1');
    expect(SPEAKER_COLORS).toContain(color);
  });

  it('returns the same color for the same speaker ID (deterministic)', () => {
    const id = 'abc-123';
    expect(getSpeakerColor(id)).toBe(getSpeakerColor(id));
  });

  it('returns different colors for different speaker IDs (distribution)', () => {
    const colors = new Set(
      ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10'].map(getSpeakerColor)
    );
    // At least 2 distinct colors among 10 IDs
    expect(colors.size).toBeGreaterThan(1);
  });

  it('handles an empty string ID without throwing', () => {
    expect(() => getSpeakerColor('')).not.toThrow();
  });
});
