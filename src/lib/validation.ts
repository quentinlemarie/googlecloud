import type {
  Speaker,
  TranscriptEntry,
  ValidationResult,
} from '../types';
import { GeminiTranscriptionResponseSchema, GeminiSummaryResponseSchema } from '../types/schemas';
import type { GeminiTranscriptionResponse, GeminiSummaryResponse } from '../types/schemas';
import { getSpeakerColor } from '../utils/colorUtils';
/** Browser-native UUID generator */
function uuidv4(): string {
  return crypto.randomUUID();
}

// ─────────────────────────────────────────────────────────────────────────────
// String sanitisation helpers
// ─────────────────────────────────────────────────────────────────────────────

const JUNK_PATTERNS = [
  /^unknown$/i,
  /^n\/a$/i,
  /^na$/i,
  /^unidentified$/i,
  /^not\s+identified$/i,
  /^not\s+available$/i,
  /^none$/i,
  /^undefined$/i,
  /^null$/i,
  /^\[.*\]$/, // [Unknown], [N/A], etc.
];

/**
 * Returns an empty string if the value matches a known junk pattern,
 * otherwise trims and returns the cleaned string.
 */
export function sanitizeString(value: string | null | undefined): string {
  if (value === null || value === undefined) return '';
  const trimmed = String(value).trim();
  if (JUNK_PATTERNS.some((re) => re.test(trimmed))) return '';
  return trimmed;
}

// ─────────────────────────────────────────────────────────────────────────────
// Speaker validation pipeline
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates and cleans a raw Gemini transcription response.
 * Returns typed Speaker[] and TranscriptEntry[] with confidence score.
 */
export function validateAndCleanSpeakers(
  rawResponse: unknown
): ValidationResult<{ speakers: Speaker[]; transcript: TranscriptEntry[] }> {
  const warnings: string[] = [];
  let confidence = 1.0;

  // 1. Parse with Zod
  const parsed = GeminiTranscriptionResponseSchema.safeParse(rawResponse);
  if (!parsed.success) {
    warnings.push('Gemini response did not match expected schema; using partial data.');
    confidence -= 0.3;
  }

  const raw = parsed.success
    ? parsed.data
    : (rawResponse as GeminiTranscriptionResponse);

  const rawSpeakers = (raw?.speakers ?? []) as GeminiTranscriptionResponse['speakers'];
  const rawTranscript = (raw?.transcript ?? []) as GeminiTranscriptionResponse['transcript'];

  // 2. Clean speakers
  const speakers: Speaker[] = rawSpeakers.map((s) => {
    const name = sanitizeString(s.name);
    const role = sanitizeString(s.role);
    const company = sanitizeString(s.company);

    if (!name) {
      warnings.push(`Speaker "${s.id}" has no name; leaving blank.`);
      confidence -= 0.05;
    }

    return {
      id: s.id ?? uuidv4(),
      label: sanitizeString(s.label) || `Speaker ${s.id}`,
      name,
      role,
      company,
      color: getSpeakerColor(s.id ?? ''),
      timestamp: typeof s.timestamp === 'number' && s.timestamp >= 0 ? s.timestamp : 0,
    };
  });

  // 3. Clean transcript
  const transcript: TranscriptEntry[] = rawTranscript.map((entry) => ({
    id: entry.id ?? uuidv4(),
    speakerId: entry.speakerId,
    text: entry.text ?? '',
    startTime: typeof entry.startTime === 'number' ? Math.max(0, entry.startTime) : 0,
    endTime:
      typeof entry.endTime === 'number' ? Math.max(0, entry.endTime) : 0,
  }));

  // Ensure endTime >= startTime
  transcript.forEach((entry, idx) => {
    if (entry.endTime < entry.startTime) {
      warnings.push(`Entry #${idx} has endTime < startTime; swapping.`);
      const temp = entry.startTime;
      entry.startTime = entry.endTime;
      entry.endTime = temp;
      confidence -= 0.02;
    }
  });

  return {
    data: { speakers, transcript },
    confidence: Math.max(0, confidence),
    warnings,
  };
}

/**
 * Validates a Gemini summary response.
 */
export function validateSummaryResponse(raw: unknown): ValidationResult<GeminiSummaryResponse> {
  const warnings: string[] = [];
  let confidence = 1.0;

  const parsed = GeminiSummaryResponseSchema.safeParse(raw);
  if (!parsed.success) {
    warnings.push('Summary response schema mismatch.');
    confidence -= 0.2;
  }

  const data = parsed.success
    ? parsed.data
    : { executiveSummary: '', structuredSummary: '', behaviouralSummary: '', remarks: [] };

  // Sanitize names inside remarks
  const cleanedRemarks = data.remarks.map((r) => ({
    ...r,
    speakerName: sanitizeString(r.speakerName),
  }));

  return {
    data: { ...data, remarks: cleanedRemarks },
    confidence: Math.max(0, confidence),
    warnings,
  };
}
