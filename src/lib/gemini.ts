import { GEMINI_API_KEY, GEMINI_MODEL } from './constants';
import { validateAndCleanSpeakers, validateSummaryResponse } from './validation';
import { validateSpeakerTimestamps } from './audioProcessing';
import type { Speaker, TranscriptEntry, SpeakerRemark } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

// Gemini inline-data limit: ~20 MB base64 (~15 MB raw). Files larger than this
// must be uploaded via the File API first.
const INLINE_SIZE_LIMIT_BYTES = 15 * 1024 * 1024; // 15 MB

/**
 * Uploads audio data to the Gemini File API and returns the hosted file URI.
 * The API key is required by this endpoint; omitting it causes a 403 error.
 */
export async function uploadFileToGemini(
  base64Data: string,
  mimeType: string,
): Promise<string> {
  // Decode base64 → binary
  const binaryStr = atob(base64Data);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  // Multipart body: JSON metadata + binary file bytes
  const boundary = `boundary_${crypto.randomUUID().replace(/-/g, '')}`;
  const metadataJson = JSON.stringify({ file: { display_name: 'audio' } });
  const metadataPart =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=utf-8\r\n\r\n` +
    `${metadataJson}\r\n`;
  const filePart = `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`;
  const closing = `\r\n--${boundary}--`;

  const bodyParts: (string | Uint8Array)[] = [
    new TextEncoder().encode(metadataPart),
    new TextEncoder().encode(filePart),
    bytes,
    new TextEncoder().encode(closing),
  ];
  const totalLength = bodyParts.reduce(
    (acc, p) => acc + (typeof p === 'string' ? p.length : p.byteLength),
    0,
  );
  const body = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of bodyParts) {
    const chunk = typeof part === 'string' ? new TextEncoder().encode(part) : part;
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const uploadResponse = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'X-Goog-Upload-Protocol': 'multipart',
      },
      body,
    },
  );

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text();
    throw new Error(`Gemini File API upload error ${uploadResponse.status}: ${errorText}`);
  }

  const uploadData = (await uploadResponse.json()) as {
    file?: { uri?: string; state?: string };
  };

  const fileUri = uploadData.file?.uri;
  if (!fileUri) {
    throw new Error('Gemini File API did not return a file URI');
  }

  return fileUri;
}

type AudioPart =
  | { inlineData: { mimeType: string; data: string } }
  | { fileData: { mimeType: string; fileUri: string } };

async function callGemini(prompt: string, audioPart?: AudioPart): Promise<string> {
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

  // Decode the base64 string to measure the raw byte length so we can decide
  // whether to send inline (small files) or via the File API (large files).
  // Base64: 4 chars → 3 bytes. Subtract padding to avoid overestimating.
  const paddingChars = (audioBase64.match(/={1,2}$/) ?? [''])[0].length;
  const rawByteLength = Math.floor((audioBase64.length * 3) / 4) - paddingChars;

  let audioPart: AudioPart;
  if (rawByteLength > INLINE_SIZE_LIMIT_BYTES) {
    const fileUri = await uploadFileToGemini(audioBase64, mimeType);
    audioPart = { fileData: { mimeType, fileUri } };
  } else {
    audioPart = { inlineData: { mimeType, data: audioBase64 } };
  }

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
