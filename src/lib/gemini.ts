import { GEMINI_API_KEY, GEMINI_MODEL } from './constants';
import { validateAndCleanSpeakers, validateSummaryResponse } from './validation';
import { validateSpeakerTimestamps } from './audioProcessing';
import type { Speaker, TranscriptEntry, SpeakerRemark } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

async function callGemini(prompt: string, audioPart?: { inlineData: { mimeType: string; data: string } }): Promise<string> {
  const parts: unknown[] = [{ text: prompt }];
  if (audioPart) parts.push(audioPart);

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }] }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${errorText}`);
  }

  const data = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  return text;
}

function extractJSON(text: string): unknown {
  // Strip markdown code fences if present
  const cleaned = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '').trim();
  return JSON.parse(cleaned);
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Transcribes audio and identifies speakers using Gemini.
 * Audio may be provided as a base64-encoded string with mimeType,
 * or as a publicly accessible URL (pass url instead of base64).
 */
export async function transcribeAudio(
  audioBase64: string,
  mimeType: string
): Promise<{ speakers: Speaker[]; transcript: TranscriptEntry[]; warnings: string[] }> {
  const prompt = `
You are a professional meeting transcription assistant.

Analyze the provided audio and return ONLY a JSON object with the following structure
(no markdown, no explanation, just JSON):

{
  "speakers": [
    {
      "id": "speaker_1",
      "label": "Speaker 1",
      "name": "Full name if identifiable, otherwise empty string",
      "role": "Job title if identifiable, otherwise empty string",
      "company": "Company name if mentioned, otherwise empty string",
      "timestamp": <seconds when this speaker first speaks as a number>
    }
  ],
  "transcript": [
    {
      "id": "entry_1",
      "speakerId": "speaker_1",
      "text": "The exact words spoken",
      "startTime": <seconds as a number>,
      "endTime": <seconds as a number>
    }
  ]
}

Rules:
- Use empty strings for unknown names, roles, and companies (NEVER use "Unknown", "N/A", etc.)
- Keep speaker IDs consistent throughout the transcript
- Timestamps must be accurate to the audio
`.trim();

  const audioPart = {
    inlineData: { mimeType, data: audioBase64 },
  };

  const raw = await callGemini(prompt, audioPart);
  const parsed = extractJSON(raw);

  const result = validateAndCleanSpeakers(parsed);

  // Validate & correct timestamps
  const timestampResult = validateSpeakerTimestamps(
    result.data.speakers,
    result.data.transcript
  );

  return {
    speakers: timestampResult.data,
    transcript: result.data.transcript,
    warnings: [...result.warnings, ...timestampResult.warnings],
  };
}

/**
 * Generates a meeting summary and per-speaker behavioural remarks.
 */
export async function generateSummaryAndRemarks(
  transcript: TranscriptEntry[],
  speakers: Speaker[]
): Promise<{ summary: string; remarks: SpeakerRemark[]; warnings: string[] }> {
  const speakerMap = Object.fromEntries(speakers.map((s) => [s.id, s.name || s.label]));
  const formattedTranscript = transcript
    .map((e) => `[${speakerMap[e.speakerId] ?? e.speakerId}]: ${e.text}`)
    .join('\n');

  const prompt = `
You are an expert meeting facilitator analysing a transcript.

Transcript:
${formattedTranscript}

Return ONLY a JSON object (no markdown, no explanation):
{
  "summary": "A clear, concise paragraph summarising the meeting",
  "remarks": [
    {
      "speakerId": "<id>",
      "speakerName": "<name or empty string>",
      "remark": "Behavioural observation about this speaker's communication style"
    }
  ]
}
`.trim();

  const raw = await callGemini(prompt);
  const parsed = extractJSON(raw);
  const result = validateSummaryResponse(parsed);

  const remarks: SpeakerRemark[] = result.data.remarks.map((r) => ({
    speakerId: r.speakerId,
    speakerName: r.speakerName ?? '',
    remark: r.remark,
  }));

  return {
    summary: result.data.summary,
    remarks,
    warnings: result.warnings,
  };
}
