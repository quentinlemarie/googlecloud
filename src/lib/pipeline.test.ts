import { describe, it, expect, vi, afterEach } from 'vitest';
import { guessMeetingType, buildExportBaseName } from './pipeline';
import type { Speaker, TranscriptEntry } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeSpeaker(
  id: string,
  opts: Partial<Speaker> = {},
): Speaker {
  return {
    id,
    label: `Speaker ${id}`,
    name: '',
    role: '',
    company: '',
    color: '#000',
    timestamp: 0,
    ...opts,
  };
}

function makeEntry(speakerId: string, idx: number): TranscriptEntry {
  return {
    id: `e${idx}`,
    speakerId,
    text: 'Hello',
    startTime: idx,
    endTime: idx + 1,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// guessMeetingType
// ─────────────────────────────────────────────────────────────────────────────

describe('guessMeetingType', () => {
  it('detects a business review', () => {
    expect(guessMeetingType('This was an intermediate business review between two teams')).toBe(
      'Business Review',
    );
  });

  it('detects a quarterly review as Business Review', () => {
    expect(guessMeetingType('quarterly review of the account')).toBe('Business Review');
  });

  it('does not false-positive on vendor names containing "course"', () => {
    // "course" is a substring of many vendor/platform names;
    // word-boundary matching should prevent it from triggering "Training".
    expect(guessMeetingType('The Acme team met with Coursera for an account review')).toBe(
      'Business Review',
    );
  });

  it('still detects training when the word stands alone', () => {
    expect(guessMeetingType('This was a training session for new hires')).toBe('Training');
  });

  it('still detects workshops', () => {
    expect(guessMeetingType('The team held a workshop on design thinking')).toBe('Training');
  });

  it('detects interview', () => {
    expect(guessMeetingType('candidate interview for senior engineer role')).toBe('Interview');
  });

  it('returns Meeting for unrecognised text', () => {
    expect(guessMeetingType('random discussion with no keywords')).toBe('Meeting');
  });

  it('prefers Business Review over generic Review', () => {
    // "business review" should match the more specific category
    expect(guessMeetingType('This is a business review meeting')).toBe('Business Review');
  });

  it('detects generic review when no business review keywords', () => {
    expect(guessMeetingType('performance feedback session')).toBe('Review');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildExportBaseName – vendor / client detection
// ─────────────────────────────────────────────────────────────────────────────

describe('buildExportBaseName', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const TODAY = '2025-06-15';

  function stubDate() {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${TODAY}T12:00:00Z`));
  }

  it('uses the non-vendor company as the client when a vendor role is detected', () => {
    stubDate();

    const speakers: Speaker[] = [
      makeSpeaker('s1', { name: 'Alice', role: 'VP of Engineering', company: 'ClientCo' }),
      makeSpeaker('s2', { name: 'Bob', role: 'Senior Engineer', company: 'ClientCo' }),
      makeSpeaker('s3', { name: 'Carol', role: 'Instructor', company: 'VendorPlatform' }),
    ];
    const transcript = [makeEntry('s1', 0), makeEntry('s2', 1), makeEntry('s3', 2)];

    const result = buildExportBaseName(speakers, transcript, 'intermediate business review');

    // Client should be "ClientCo", not "VendorPlatform"
    expect(result).toContain('ClientCo');
    expect(result).not.toContain('VendorPlatform');
    expect(result).toContain('Business Review');
  });

  it('falls back to fewest-speakers heuristic when no vendor role detected', () => {
    stubDate();

    const speakers: Speaker[] = [
      makeSpeaker('s1', { name: 'Alice', role: 'CEO', company: 'SmallCo' }),
      makeSpeaker('s2', { name: 'Bob', role: 'Engineer', company: 'BigCo' }),
      makeSpeaker('s3', { name: 'Carol', role: 'PM', company: 'BigCo' }),
    ];
    const transcript = [makeEntry('s1', 0), makeEntry('s2', 1), makeEntry('s3', 2)];

    const result = buildExportBaseName(speakers, transcript, 'kickoff session');

    // No vendor roles → fallback picks company with fewest speakers
    expect(result).toContain('SmallCo');
    expect(result).toContain('Alice');
    expect(result).toContain('Kickoff');
  });

  it('picks the stakeholder who spoke most from the client company', () => {
    stubDate();

    const speakers: Speaker[] = [
      makeSpeaker('s1', { name: 'Alice', role: 'Director', company: 'ClientCo' }),
      makeSpeaker('s2', { name: 'Bob', role: 'Manager', company: 'ClientCo' }),
      makeSpeaker('s3', { name: 'Carol', role: 'Trainer', company: 'TrainingInc' }),
    ];
    // Alice spoke much more than Bob
    const transcript = [
      ...Array.from({ length: 10 }, (_, i) => makeEntry('s1', i)),
      makeEntry('s2', 10),
      makeEntry('s3', 11),
    ];

    const result = buildExportBaseName(speakers, transcript, 'a training workshop');

    expect(result).toContain('ClientCo');
    expect(result).toContain('Alice');
    expect(result).toContain('Training');
  });

  it('handles single-company correctly', () => {
    stubDate();

    const speakers: Speaker[] = [
      makeSpeaker('s1', { name: 'Alice', role: 'PM', company: 'OnlyCo' }),
      makeSpeaker('s2', { name: 'Bob', role: 'Engineer', company: 'OnlyCo' }),
    ];
    const transcript = [makeEntry('s1', 0), makeEntry('s2', 1)];

    const result = buildExportBaseName(speakers, transcript, 'standup');

    expect(result).toBe(`${TODAY} OnlyCo Alice Team Sync`);
  });

  it('handles no-company gracefully', () => {
    stubDate();

    const speakers: Speaker[] = [
      makeSpeaker('s1', { name: 'Alice' }),
      makeSpeaker('s2', { name: 'Bob' }),
    ];
    const transcript = [makeEntry('s1', 0), makeEntry('s2', 1)];

    const result = buildExportBaseName(speakers, transcript, 'just chatting');

    expect(result).toBe(`${TODAY} Alice Bob Meeting`);
  });

  it('does not use the vendor platform name in the file name', () => {
    stubDate();

    const speakers: Speaker[] = [
      makeSpeaker('s1', { name: 'John', role: 'CTO', company: 'Acme Corp' }),
      makeSpeaker('s2', { name: 'Jane', role: 'Account Manager', company: 'SaaSVendor' }),
    ];
    const transcript = [makeEntry('s1', 0), makeEntry('s2', 1)];

    const result = buildExportBaseName(speakers, transcript, 'account review discussion');

    expect(result).toContain('Acme Corp');
    expect(result).not.toContain('SaaSVendor');
    expect(result).toContain('Business Review');
  });
});
