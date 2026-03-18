import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Base schemas
// ─────────────────────────────────────────────────────────────────────────────
export const SpeakerSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  name: z.string().default(''),
  role: z.string().default(''),
  company: z.string().default(''),
  color: z.string().default('#888888'),
  timestamp: z.number().min(0).default(0),
  audioSampleUrl: z.string().url().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export const TranscriptEntrySchema = z.object({
  id: z.string().min(1),
  speakerId: z.string().min(1),
  text: z.string(),
  startTime: z.number().min(0),
  endTime: z.number().min(0),
});

// ─────────────────────────────────────────────────────────────────────────────
// Gemini API response schemas
// ─────────────────────────────────────────────────────────────────────────────

// Speaker identification response from Gemini
export const GeminiSpeakerSchema = z.object({
  id: z.string(),
  label: z.string(),
  name: z.string().optional().nullable(),
  role: z.string().optional().nullable(),
  company: z.string().optional().nullable(),
  timestamp: z.number().optional().nullable(),
});

export const GeminiTranscriptEntrySchema = z.object({
  id: z.string().optional(),
  speakerId: z.string(),
  text: z.string(),
  startTime: z.number(),
  endTime: z.number(),
});

export const GeminiTranscriptionResponseSchema = z.object({
  speakers: z.array(GeminiSpeakerSchema),
  transcript: z.array(GeminiTranscriptEntrySchema),
});

// Summary response
export const GeminiSummaryResponseSchema = z.object({
  executiveSummary: z.string(),
  structuredSummary: z.string(),
  behaviouralSummary: z.string(),
  remarks: z.array(
    z.object({
      speakerId: z.string(),
      speakerName: z.string().optional().nullable(),
      remark: z.string(),
    })
  ),
});

// ─────────────────────────────────────────────────────────────────────────────
// Type exports inferred from schemas
// ─────────────────────────────────────────────────────────────────────────────
export type GeminiSpeaker = z.infer<typeof GeminiSpeakerSchema>;
export type GeminiTranscriptEntry = z.infer<typeof GeminiTranscriptEntrySchema>;
export type GeminiTranscriptionResponse = z.infer<typeof GeminiTranscriptionResponseSchema>;
export type GeminiSummaryResponse = z.infer<typeof GeminiSummaryResponseSchema>;
