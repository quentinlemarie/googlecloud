import { GEMINI_API_KEY, GEMINI_MODELS, CHAT_CACHE_TTL_S } from './constants';
import { validateAndCleanSpeakers, validateSummaryResponse } from './validation';
import { validateSpeakerTimestamps } from './audioProcessing';
import type { Speaker, TranscriptEntry, SpeakerRemark, OutputLanguage, AnalysisMode } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

async function callGemini(model: string, prompt: string, audioPart?: { inlineData: { mimeType: string; data: string } }): Promise<string> {
  const parts: unknown[] = [{ text: prompt }];
  if (audioPart) parts.push(audioPart);

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
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

/**
 * Attempts to repair common LLM JSON issues:
 *  - Trailing commas before } or ]
 *  - Single-quoted property names / string values
 *  - JavaScript-style single-line comments
 */
export function repairJSON(text: string): string {
  let s = text;

  // 1. Remove single-line JS comments (// …) that are NOT inside strings.
  //    Walk the string character-by-character to respect quoted regions.
  let result = '';
  let inString = false;
  let stringChar = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const next = s[i + 1];

    if (inString) {
      result += ch;
      if (ch === '\\') {
        // skip escaped character
        result += next ?? '';
        i++;
      } else if (ch === stringChar) {
        inString = false;
      }
    } else {
      if (ch === '"' || ch === "'") {
        inString = true;
        stringChar = ch;
        result += ch;
      } else if (ch === '/' && next === '/') {
        // consume the rest of the line (the comment)
        while (i < s.length && s[i] !== '\n') i++;
        // keep the newline so line structure stays intact
        result += '\n';
      } else {
        result += ch;
      }
    }
  }
  s = result;

  // 2. Replace single-quoted keys/values with double-quoted equivalents.
  //    Walk character-by-character to avoid false positives inside double-quoted strings.
  result = '';
  inString = false;
  stringChar = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const next = s[i + 1];

    if (inString) {
      if (ch === '\\') {
        result += ch + (next ?? '');
        i++;
      } else if (ch === stringChar) {
        // End of single-quoted string → emit double quote
        result += stringChar === "'" ? '"' : ch;
        inString = false;
      } else {
        // Inside a single-quoted string: escape any unescaped double quotes
        if (stringChar === "'" && ch === '"') {
          result += '\\"';
        } else {
          result += ch;
        }
      }
    } else {
      if (ch === "'") {
        inString = true;
        stringChar = "'";
        result += '"';
      } else if (ch === '"') {
        inString = true;
        stringChar = '"';
        result += ch;
      } else {
        result += ch;
      }
    }
  }
  s = result;

  // 3. Remove trailing commas before } or ] (with optional whitespace between)
  s = s.replace(/,\s*([}\]])/g, '$1');

  return s;
}

function extractJSON(text: string): unknown {
  // Strip markdown code fences if present
  const cleaned = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '').trim();

  // Fast path: try parsing directly
  try {
    return JSON.parse(cleaned);
  } catch {
    // Slow path: attempt to repair common LLM JSON issues and retry
    const repaired = repairJSON(cleaned);
    return JSON.parse(repaired);
  }
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
  mimeType: string,
  outputLanguage: OutputLanguage = 'en',
  analysisMode: AnalysisMode = 'deep'
): Promise<{ speakers: Speaker[]; transcript: TranscriptEntry[]; warnings: string[] }> {
  const languageInstruction = outputLanguage === 'fr'
    ? 'Write ALL output in French: transcribe spoken words in French, and write names, roles, and company names in French where applicable.'
    : 'Write ALL output text in English.';

  const prompt = `
You are a professional meeting transcription assistant.

CRITICAL INSTRUCTIONS:
- ${languageInstruction}

Analyze the provided audio and return ONLY a JSON object with the following structure
(no markdown, no explanation, just JSON):

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

  const model = GEMINI_MODELS[analysisMode];
  const raw = await callGemini(model, prompt, audioPart);
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
  speakers: Speaker[],
  outputLanguage: OutputLanguage = 'en',
  analysisMode: AnalysisMode = 'deep'
): Promise<{ executiveSummary: string; structuredSummary: string; behaviouralSummary: string; remarks: SpeakerRemark[]; warnings: string[]; _cacheContext: { prompt: string; rawResponse: string } }> {
  const speakerMap = Object.fromEntries(speakers.map((s) => [s.id, s.name || s.label]));
  const formattedTranscript = transcript
    .map((e) => `[${speakerMap[e.speakerId] ?? e.speakerId}]: ${e.text}`)
    .join('\n');

  const languageInstruction = outputLanguage === 'fr'
    ? 'Write ALL output text in French.'
    : 'Write ALL output text in English.';

  const prompt = `
You are an expert meeting analyst. Analyse both the audio for cues and tones and the transcript to return ONLY a JSON object.

CRITICAL INSTRUCTIONS:
- ${languageInstruction}
- Use Markdown bullet points (-) for the items under each section.
- Do not use hashtags (#).
- Make it concise and actionable.
- For behavioural analysis: do not be too nice. Call out flaws, mistakes, and interpersonal dynamics honestly, but also what was done well. Analyse tone and communication patterns to enhance your analysis.

Transcript:
${formattedTranscript}

Return ONLY a JSON object (no markdown code fences, no explanation):
{
  "executiveSummary": "A concise 2-3 sentence overview of what was discussed and decided",
  "structuredSummary": "Structured overview using Markdown bullet points (no hashtags), organised under these plain-text labels:\\nSpeakers & Roles:\\n- ...\\nKey Topics:\\n- ...\\nObstacles / Friction Points:\\n- ...\\nNext Steps / Action Items:\\n- ...",
  "behaviouralSummary": "Overall group dynamics and interpersonal analysis using Markdown bullet points (no hashtags). Do not hesitate to quote names if certain individual behaviour are worth mentionning (not all). Be honest and direct.",
  "remarks": [
    {
      "speakerId": "<id>",
      "speakerName": "<name or empty string>",
      "remark": "Honest individual behavioural observation covering communication style, tone, strengths, and any flaws or mistakes or success"
    }
  ]
}
`.trim();

  const model = GEMINI_MODELS[analysisMode];
  const raw = await callGemini(model, prompt);
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
    _cacheContext: { prompt, rawResponse: raw },
  };
}

/**
 * Creates a Gemini server-side cache from the analysis conversation.
 * Returns the cache name (used as chatCacheId) or null if caching fails.
 */
export async function createAnalysisCache(
  cacheContext: { prompt: string; rawResponse: string },
  model: string
): Promise<string | null> {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/cachedContents?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: `models/${model}`,
          contents: [
            { role: 'user', parts: [{ text: cacheContext.prompt }] },
            { role: 'model', parts: [{ text: cacheContext.rawResponse }] },
          ],
          ttl: `${CHAT_CACHE_TTL_S}s`,
        }),
      }
    );

    if (!response.ok) {
      console.warn(`Gemini cache creation failed (HTTP ${response.status})`);
      return null;
    }

    const data = (await response.json()) as { name?: string };
    return data.name ?? null;
  } catch (err) {
    console.warn('Gemini cache creation error:', err);
    return null;
  }
}

/**
 * Sends a chat message in the context of a previous analysis.
 * Uses the Gemini context cache when available; falls back to inline context.
 */
export async function chatWithAnalysis(
  userMessage: string,
  history: { role: 'user' | 'model'; text: string }[],
  model: string,
  chatCacheId: string | null,
  inlineContext: { prompt: string; rawResponse: string } | null
): Promise<string> {
  const conversationContents = [
    ...history.map((m) => ({
      role: m.role,
      parts: [{ text: m.text }],
    })),
    { role: 'user', parts: [{ text: userMessage }] },
  ];

  const systemInstruction = {
    parts: [
      {
        text: 'You are a helpful assistant answering questions about a meeting analysis. Be concise, factual, and reference the meeting content when relevant.',
      },
    ],
  };

  if (chatCacheId) {
    // Use the server-side cached context
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cachedContent: chatCacheId,
            systemInstruction,
            contents: conversationContents,
          }),
        }
      );

      if (response.ok) {
        const data = (await response.json()) as {
          candidates?: { content?: { parts?: { text?: string }[] } }[];
        };
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
        if (text) return text;
      }
    } catch {
      // Fall through to inline context fallback
    }
  }

  // Fallback: prepend inline context as the first turn
  const contents = inlineContext
    ? [
        { role: 'user', parts: [{ text: inlineContext.prompt }] },
        { role: 'model', parts: [{ text: inlineContext.rawResponse }] },
        ...conversationContents,
      ]
    : conversationContents;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction,
        contents,
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${errorText}`);
  }

  const data = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}
