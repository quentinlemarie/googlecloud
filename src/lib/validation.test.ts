import { describe, it, expect } from 'vitest';
import { sanitizeString, validateAndCleanSpeakers, validateSummaryResponse } from './validation';

// ─────────────────────────────────────────────────────────────────────────────
// sanitizeString
// ─────────────────────────────────────────────────────────────────────────────
describe('sanitizeString', () => {
  it('trims whitespace', () => {
    expect(sanitizeString('  hello  ')).toBe('hello');
  });

  it('returns empty string for null', () => {
    expect(sanitizeString(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(sanitizeString(undefined)).toBe('');
  });

  it.each([
    'unknown', 'UNKNOWN', 'n/a', 'N/A', 'na', 'NA',
    'unidentified', 'not identified', 'not available',
    'none', 'undefined', 'null',
    '[Unknown]', '[N/A]', '[anything]',
  ])('returns empty string for junk value "%s"', (junk) => {
    expect(sanitizeString(junk)).toBe('');
  });

  it('returns the value when it is a normal name', () => {
    expect(sanitizeString('Alice')).toBe('Alice');
  });

  it('returns the value when it contains brackets but is not purely bracketed', () => {
    expect(sanitizeString('Alice [CEO]')).toBe('Alice [CEO]');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateAndCleanSpeakers
// ─────────────────────────────────────────────────────────────────────────────

const validRawResponse = {
  speakers: [
    { id: 'sp1', label: 'Speaker 1', name: 'Alice', role: 'Engineer', company: 'Acme', timestamp: 0 },
    { id: 'sp2', label: 'Speaker 2', name: 'Bob', role: null, company: null, timestamp: 5 },
  ],
  transcript: [
    { id: 't1', speakerId: 'sp1', text: 'Hello.', startTime: 0, endTime: 3 },
    { id: 't2', speakerId: 'sp2', text: 'Hi there.', startTime: 5, endTime: 8 },
  ],
};

describe('validateAndCleanSpeakers', () => {
  it('returns confidence 1.0 for a perfectly valid response', () => {
    const result = validateAndCleanSpeakers(validRawResponse);
    expect(result.confidence).toBe(1.0);
    expect(result.warnings).toHaveLength(0);
  });

  it('maps speaker fields correctly', () => {
    const result = validateAndCleanSpeakers(validRawResponse);
    const alice = result.data.speakers[0]!;
    expect(alice.id).toBe('sp1');
    expect(alice.name).toBe('Alice');
    expect(alice.role).toBe('Engineer');
    expect(alice.company).toBe('Acme');
    expect(alice.timestamp).toBe(0);
  });

  it('sanitizes junk speaker names and emits a warning', () => {
    const raw = {
      speakers: [{ id: 'sp1', label: 'Speaker 1', name: 'Unknown', timestamp: 0 }],
      transcript: [],
    };
    const result = validateAndCleanSpeakers(raw);
    expect(result.data.speakers[0]!.name).toBe('');
    expect(result.warnings.some((w) => w.includes('sp1'))).toBe(true);
    expect(result.confidence).toBeLessThan(1.0);
  });

  it('sanitizes null role and company to empty string', () => {
    const result = validateAndCleanSpeakers(validRawResponse);
    const bob = result.data.speakers[1]!;
    expect(bob.role).toBe('');
    expect(bob.company).toBe('');
  });

  it('clamps negative startTime to 0', () => {
    const raw = {
      speakers: [{ id: 'sp1', label: 'Speaker 1', name: 'Alice', timestamp: 0 }],
      transcript: [{ id: 't1', speakerId: 'sp1', text: 'Hi', startTime: -5, endTime: 3 }],
    };
    const result = validateAndCleanSpeakers(raw);
    expect(result.data.transcript[0]!.startTime).toBe(0);
  });

  it('swaps startTime/endTime when endTime < startTime', () => {
    const raw = {
      speakers: [{ id: 'sp1', label: 'Speaker 1', name: 'Alice', timestamp: 0 }],
      transcript: [{ id: 't1', speakerId: 'sp1', text: 'Hi', startTime: 10, endTime: 5 }],
    };
    const result = validateAndCleanSpeakers(raw);
    const entry = result.data.transcript[0]!;
    expect(entry.startTime).toBe(5);
    expect(entry.endTime).toBe(10);
    expect(result.warnings.some((w) => w.includes('endTime < startTime'))).toBe(true);
  });

  it('generates a UUID for entries without an id', () => {
    const raw = {
      speakers: [{ id: 'sp1', label: 'Speaker 1', name: 'Alice', timestamp: 0 }],
      transcript: [{ speakerId: 'sp1', text: 'Hi', startTime: 0, endTime: 3 }],
    };
    const result = validateAndCleanSpeakers(raw);
    expect(result.data.transcript[0]!.id).toBeTruthy();
  });

  it('reduces confidence and emits a warning when the schema does not match', () => {
    const result = validateAndCleanSpeakers({ bad: 'data' });
    expect(result.confidence).toBeLessThan(1.0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('handles an empty transcript array', () => {
    const raw = { speakers: [], transcript: [] };
    const result = validateAndCleanSpeakers(raw);
    expect(result.data.speakers).toHaveLength(0);
    expect(result.data.transcript).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateSummaryResponse
// ─────────────────────────────────────────────────────────────────────────────

describe('validateSummaryResponse', () => {
  it('returns confidence 1.0 for a valid summary response', () => {
    const raw = {
      summary: 'A great meeting.',
      remarks: [{ speakerId: 'sp1', speakerName: 'Alice', remark: 'Good point.' }],
    };
    const result = validateSummaryResponse(raw);
    expect(result.confidence).toBe(1.0);
    expect(result.warnings).toHaveLength(0);
  });

  it('sanitizes junk speaker names inside remarks', () => {
    const raw = {
      summary: 'Meeting notes.',
      remarks: [{ speakerId: 'sp1', speakerName: 'Unknown', remark: 'Something.' }],
    };
    const result = validateSummaryResponse(raw);
    expect(result.data.remarks[0]!.speakerName).toBe('');
  });

  it('keeps the summary text unchanged', () => {
    const raw = { summary: 'Key decisions made.', remarks: [] };
    const result = validateSummaryResponse(raw);
    expect(result.data.summary).toBe('Key decisions made.');
  });

  it('reduces confidence when schema does not match', () => {
    const result = validateSummaryResponse({ unexpected: true });
    expect(result.confidence).toBeLessThan(1.0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
