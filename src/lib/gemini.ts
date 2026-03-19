import { GEMINI_API_KEY, GEMINI_MODEL } from './constants';
import { validateAndCleanSpeakers, validateSummaryResponse } from './validation';
import { validateSpeakerTimestamps } from './audioProcessing';
import type { Speaker, TranscriptEntry, SpeakerRemark } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Response schemas for Gemini JSON mode (OpenAPI subset)
// Providing a schema with responseMimeType "application/json" enables
// constrained decoding, which speeds up token generation and guarantees
// structurally valid JSON output.
// ─────────────────────────────────────────────────────────────────────────────

const TRANSCRIPTION_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    speakers: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          id: { type: 'STRING' },
          label: { type: 'STRING' },
          name: { type: 'STRING' },
          role: { type: 'STRING' },
          company: { type: 'STRING' },
          timestamp: { type: 'NUMBER' },
        },
        required: ['id', 'label', 'name', 'role', 'company', 'timestamp'],
      },
    },
    transcript: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          id: { type: 'STRING' },
          speakerId: { type: 'STRING' },
          text: { type: 'STRING' },
          startTime: { type: 'NUMBER' },
          endTime: { type: 'NUMBER' },
        },
        required: ['id', 'speakerId', 'text', 'startTime', 'endTime'],
      },
    },
  },
  required: ['speakers', 'transcript'],
};

const SUMMARY_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    executiveSummary: { type: 'STRING' },
    structuredSummary: { type: 'STRING' },
    behaviouralSummary: { type: 'STRING' },
    remarks: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          speakerId: { type: 'STRING' },
          speakerName: { type: 'STRING' },
          remark: { type: 'STRING' },
        },
        required: ['speakerId', 'speakerName', 'remark'],
      },
    },
  },
  required: ['executiveSummary', 'structuredSummary', 'behaviouralSummary', 'remarks'],
};

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

interface GenerationConfig {
  responseMimeType?: string;
  responseSchema?: Record<string, unknown>;
  temperature?: number;
}

async function callGemini(
  prompt: string,
  audioPart?: { inlineData: { mimeType: string; data: string } },
  generationConfig?: GenerationConfig,
): Promise<string> {
  const parts: unknown[] = [{ text: prompt }];
  if (audioPart) parts.push(audioPart);

  const body: Record<string, unknown> = { contents: [{ parts }] };
  if (generationConfig) body.generationConfig = generationConfig;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
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

/**
 * Streams the Gemini response via SSE, calling onChunk with the total
 * accumulated character count after each chunk arrives.  This enables
 * real-time progress tracking during long-running audio transcription.
 */
async function callGeminiStreaming(
  prompt: string,
  audioPart: { inlineData: { mimeType: string; data: string } },
  generationConfig: GenerationConfig,
  onChunk?: (totalChars: number) => void,
): Promise<string> {
  const parts: unknown[] = [{ text: prompt }, audioPart];

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig,
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${errorText}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let accumulated = '';
  let sseBuffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    sseBuffer += decoder.decode(value, { stream: true });

    // Split on double newline (SSE event boundary)
    const events = sseBuffer.split('\n\n');
    sseBuffer = events.pop()!; // Keep incomplete event in buffer

    for (const event of events) {
      for (const line of event.split('\n')) {
        if (line.startsWith('data: ')) {
          try {
            const json = JSON.parse(line.slice(6));
            const text =
              json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
            accumulated += text;
          } catch {
            // Skip malformed SSE data lines
          }
        }
      }
    }

    onChunk?.(accumulated.length);
  }

  // Flush remaining buffer
  if (sseBuffer.trim()) {
    for (const line of sseBuffer.split('\n')) {
      if (line.startsWith('data: ')) {
        try {
          const json = JSON.parse(line.slice(6));
          const text =
            json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
          accumulated += text;
        } catch {
          // Skip malformed data
        }
      }
    }
    onChunk?.(accumulated.length);
  }

  return accumulated;
}

function extractJSON(text: string): unknown {
  // Strip markdown code fences if present (shouldn't happen with JSON mode,
  // but kept for robustness)
  const cleaned = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '').trim();
  return JSON.parse(cleaned);
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Transcribes audio and identifies speakers using Gemini.
 * Uses streaming + JSON mode for faster generation and real-time progress.
 *
 * @param onChunk Optional callback receiving accumulated character count
 *                during streaming, used by the pipeline for progress tracking.
 */
export async function transcribeAudio(
  audioBase64: string,
  mimeType: string,
  onChunk?: (totalChars: number) => void,
): Promise<{ speakers: Speaker[]; transcript: TranscriptEntry[]; warnings: string[] }> {
  const prompt = `
You are a professional meeting transcription assistant.

Analyze the provided audio and return a JSON object with the following structure:

{
  "speakers": [
    {
      "id": "speaker_1",
      "label": "Speaker 1",
      "name": "Full name if identifiable, otherwise empty string",
      "role": "Job title or seniority level. Infer from explicit mentions, how speakers address each other, decision-making authority, topics discussed, and speech patterns (e.g. 'CEO', 'Senior Engineer', 'Director', 'Project Manager', 'Intern'). Use empty string only if truly uninferable.",
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
- Use empty strings for unknown names and companies (NEVER use "Unknown", "N/A", etc.)
- For role: infer seniority and title from context even when not explicitly stated — consider authority level, how others address the speaker, topics they lead, self-introductions, and decision-making patterns; use empty string only if no inference is possible
- Keep speaker IDs consistent throughout the transcript
- Timestamps must be accurate to the audio
`.trim();

  const audioPart = {
    inlineData: { mimeType, data: audioBase64 },
  };

  const generationConfig: GenerationConfig = {
    responseMimeType: 'application/json',
    responseSchema: TRANSCRIPTION_RESPONSE_SCHEMA,
    temperature: 0,
  };

  const raw = await callGeminiStreaming(prompt, audioPart, generationConfig, onChunk);
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
 * Uses JSON mode for faster, more reliable output.
 */
export async function generateSummaryAndRemarks(
  transcript: TranscriptEntry[],
  speakers: Speaker[]
): Promise<{ executiveSummary: string; structuredSummary: string; behaviouralSummary: string; remarks: SpeakerRemark[]; warnings: string[] }> {
  const speakerMap = Object.fromEntries(speakers.map((s) => [s.id, s.name || s.label]));
  const formattedTranscript = transcript
    .map((e) => `[${speakerMap[e.speakerId] ?? e.speakerId}]: ${e.text}`)
    .join('\n');

  const prompt = `
You are an expert meeting analyst. Analyse the transcript below and return a JSON object.

CRITICAL INSTRUCTIONS:
- Use Markdown bullet points (-) for the items under each section.
- Do not use hashtags (#).
- Make it concise and actionable.
- For behavioural analysis: do not be too nice. Call out flaws, mistakes, and interpersonal dynamics honestly. Analyse tone and communication patterns to enhance your analysis.

Transcript:
${formattedTranscript}

Return a JSON object:
{
  "executiveSummary": "A concise 2-3 sentence overview of what was discussed and decided",
  "structuredSummary": "Structured overview using Markdown bullet points (no hashtags), organised under these plain-text labels:\\nSpeakers & Roles:\\n- ...\\nKey Topics:\\n- ...\\nObstacles / Friction Points:\\n- ...\\nNext Steps / Action Items:\\n- ...",
  "behaviouralSummary": "Overall group dynamics and interpersonal analysis using Markdown bullet points (no hashtags). Be honest and direct.",
  "remarks": [
    {
      "speakerId": "<id>",
      "speakerName": "<name or empty string>",
      "remark": "Honest individual behavioural observation covering communication style, tone, strengths, and any flaws or mistakes"
    }
  ]
}
`.trim();

  const generationConfig: GenerationConfig = {
    responseMimeType: 'application/json',
    responseSchema: SUMMARY_RESPONSE_SCHEMA,
    temperature: 0,
  };

  const raw = await callGemini(prompt, undefined, generationConfig);
  const parsed = extractJSON(raw);
  const result = validateSummaryResponse(parsed);

  const remarks: SpeakerRemark[] = result.data.remarks.map((r) => ({
    speakerId: r.speakerId,
    speakerName: r.speakerName ?? '',
    remark: r.remark,
  }));

  return {
    executiveSummary: result.data.executiveSummary,
    structuredSummary: result.data.structuredSummary,
    behaviouralSummary: result.data.behaviouralSummary,
    remarks,
    warnings: result.warnings,
  };
}
