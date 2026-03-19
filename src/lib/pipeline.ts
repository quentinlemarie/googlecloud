import type { TranscriptionState, Speaker, TranscriptEntry } from '../types';
import { transcribeAudio } from './gemini';
import { generateSummaryAndRemarks } from './gemini';
import {
  uploadToCloudStorage,
  downloadDriveFile,
  openDrivePicker,
  openDriveFolderPicker,
  uploadToDrive,
  uploadBlobToDrive,
  createDriveFolder,
} from './storage';
import { requestAccessToken } from './auth';
import { reportError } from './errorReporting';
import { mimeToExtension } from '../utils/mimeUtils';

export type ProgressCallback = (progress: number, message: string) => void;
export type ErrorCallback = (message: string) => void;

// Scaling factor for the exponential progress curve during streaming.
// A typical meeting transcript generates ~20-80 KB of JSON, so 20 000
// characters puts the midpoint (~63 %) roughly in the middle of that range.
const STREAM_PROGRESS_CHAR_SCALE = 20_000;

// ─────────────────────────────────────────────────────────────────────────────
// Slowly tick progress forward during a long-running async operation.
// Uses an asymptotic curve: each tick covers ~12% of the remaining distance,
// so the bar moves quickly at first and slows down as it approaches `to`.
// Returns a cleanup function that stops the timer.
// ─────────────────────────────────────────────────────────────────────────────
function startProgressTicker(
  onProgress: ProgressCallback,
  message: string,
  from: number,
  to: number,
  intervalMs = 2000,
): () => void {
  let current = from;
  const timer = setInterval(() => {
    current += (to - current) * 0.12;
    onProgress(Math.round(current), message);
  }, intervalMs);
  return () => clearInterval(timer);
}

// ─────────────────────────────────────────────────────────────────────────────
// Audio downsampling to 16 kHz mono via OfflineAudioContext.
// Reduces the upload payload by ~4-8× before sending to Gemini.
// Falls back to the original file when the Web Audio API is unavailable
// (e.g. during SSR / tests) or when decoding fails.
// ─────────────────────────────────────────────────────────────────────────────
const DOWNSAMPLE_RATE = 16_000; // 16 kHz – sufficient for speech recognition

async function downsampleAudio(
  file: File | Blob,
): Promise<{ base64: string; mimeType: string }> {
  // Bail out if Web Audio API is unavailable (SSR / test environment)
  if (typeof AudioContext === 'undefined' && typeof OfflineAudioContext === 'undefined') {
    const base64 = await fileToBase64(file);
    return { base64, mimeType: file.type || 'audio/webm' };
  }

  try {
    const arrayBuffer = await file.arrayBuffer();

    // Decode the uploaded audio into raw PCM samples
    const audioCtx = new AudioContext();
    const decoded = await audioCtx.decodeAudioData(arrayBuffer);
    await audioCtx.close();

    // Compute the target length at 16 kHz
    const duration = decoded.duration;
    const targetLength = Math.ceil(duration * DOWNSAMPLE_RATE);

    // Resample to 16 kHz, 1 channel using OfflineAudioContext
    const offline = new OfflineAudioContext(1, targetLength, DOWNSAMPLE_RATE);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start(0);
    const rendered = await offline.startRendering();

    // Encode as 16-bit PCM WAV
    const pcmData = rendered.getChannelData(0);
    const wavBuffer = encodeWav(pcmData, DOWNSAMPLE_RATE);

    // Convert to base64
    const bytes = new Uint8Array(wavBuffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]!);
    }
    const base64 = btoa(binary);

    return { base64, mimeType: 'audio/wav' };
  } catch (err) {
    // Fallback: send original file if decoding/resampling fails
    console.warn('Audio downsampling failed, using original file:', err);
    const base64 = await fileToBase64(file);
    return { base64, mimeType: file.type || 'audio/webm' };
  }
}

/**
 * Encodes 32-bit float PCM samples as a 16-bit PCM WAV file.
 */
function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = samples.length * (bitsPerSample / 8);
  const headerSize = 44;
  const buffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');

  // fmt sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);           // sub-chunk size
  view.setUint16(20, 1, true);            // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // data sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Write PCM samples (float32 → int16)
  let offset = headerSize;
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]!));
    const int16 = clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF;
    view.setInt16(offset, int16, true);
    offset += 2;
  }

  return buffer;
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Convert a File or Blob to base64 (raw, no downsampling)
// ─────────────────────────────────────────────────────────────────────────────
function fileToBase64(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the data URI prefix "data:<type>;base64,"
      const base64 = result.split(',')[1] ?? '';
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Process audio from any source
// ─────────────────────────────────────────────────────────────────────────────

export interface ProcessAudioResult {
  speakers: Speaker[];
  transcript: TranscriptEntry[];
  audioBase64: string;
  mimeType: string;
}

/**
 * Orchestrates the full audio processing pipeline:
 * 1. Load audio (Drive / upload / microphone)
 * 2. Transcribe + identify speakers via Gemini
 * 3. Return cleaned data ready for review
 */
export async function processAudioFile(
  file: File,
  onProgress: ProgressCallback,
  onError: ErrorCallback
): Promise<ProcessAudioResult | null> {
  try {
    onProgress(10, 'Processing audio…');
    const { base64: audioBase64, mimeType } = await downsampleAudio(file);

    onProgress(30, 'Sending to Gemini…');

    // Two-phase progress tracking:
    // Phase 1 (30→48%): slow ticker while Gemini analyses the audio
    // Phase 2 (48→90%): real progress driven by streaming chunks
    const WAIT_END = 48;
    const STREAM_END = 90;
    const stopWaitTicker = startProgressTicker(onProgress, 'Analysing audio…', 30, WAIT_END);
    let receivedFirstChunk = false;
    let lastReportedProgress = 30;

    const onStreamProgress = (totalChars: number) => {
      if (!receivedFirstChunk) {
        receivedFirstChunk = true;
        stopWaitTicker();
      }
      // Exponential approach: fast initial progress, decelerates near STREAM_END
      const fraction = 1 - Math.exp(-totalChars / STREAM_PROGRESS_CHAR_SCALE);
      const newProgress = Math.round(WAIT_END + (STREAM_END - WAIT_END) * fraction);
      if (newProgress > lastReportedProgress) {
        lastReportedProgress = newProgress;
        onProgress(newProgress, 'Transcribing…');
      }
    };

    const { speakers, transcript, warnings } = await transcribeAudio(audioBase64, mimeType, onStreamProgress);
    if (!receivedFirstChunk) stopWaitTicker();

    if (warnings.length > 0) {
      console.warn('Transcription warnings:', warnings);
    }

    onProgress(95, 'Cleaning up…');
    return { speakers, transcript, audioBase64, mimeType };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Unknown error during processing';
    onError(message);
    await reportError(err, 'processAudioFile');
    return null;
  }
}

/**
 * Loads an audio file from Google Drive, then runs the transcription pipeline.
 */
export async function processFromDrive(
  onProgress: ProgressCallback,
  onError: ErrorCallback
): Promise<ProcessAudioResult | null> {
  try {
    onProgress(2, 'Authenticating with Google…');
    const accessToken = await requestAccessToken();

    onProgress(5, 'Opening Drive picker…');
    const selected = await openDrivePicker(accessToken);
    if (!selected) return null;

    onProgress(8, `Downloading "${selected.name}" from Drive…`);
    const { data: rawBase64, mimeType: rawMimeType } = await downloadDriveFile(selected.id, accessToken);

    // Downsample to 16 kHz mono for a smaller payload
    onProgress(10, 'Processing audio…');
    const rawBytes = Uint8Array.from(atob(rawBase64), (c) => c.charCodeAt(0));
    const rawBlob = new Blob([rawBytes], { type: rawMimeType });
    const { base64: audioBase64, mimeType } = await downsampleAudio(rawBlob);

    // Two-phase progress tracking:
    // Phase 1 (15→34%): slow ticker while Gemini analyses the audio
    // Phase 2 (34→90%): real progress driven by streaming chunks
    const WAIT_END = 34;
    const STREAM_END = 90;
    const stopWaitTicker = startProgressTicker(onProgress, 'Analysing audio…', 15, WAIT_END);
    let receivedFirstChunk = false;
    let lastReportedProgress = 15;

    const onStreamProgress = (totalChars: number) => {
      if (!receivedFirstChunk) {
        receivedFirstChunk = true;
        stopWaitTicker();
      }
      const fraction = 1 - Math.exp(-totalChars / STREAM_PROGRESS_CHAR_SCALE);
      const newProgress = Math.round(WAIT_END + (STREAM_END - WAIT_END) * fraction);
      if (newProgress > lastReportedProgress) {
        lastReportedProgress = newProgress;
        onProgress(newProgress, 'Transcribing…');
      }
    };

    const { speakers, transcript, warnings } = await transcribeAudio(audioBase64, mimeType, onStreamProgress);
    if (!receivedFirstChunk) stopWaitTicker();

    if (warnings.length > 0) {
      console.warn('Transcription warnings:', warnings);
    }

    onProgress(95, 'Cleaning up…');
    return { speakers, transcript, audioBase64, mimeType };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    onError(message);
    await reportError(err, 'processFromDrive');
    return null;
  }
}

/**
 * Generates summary + remarks from reviewed speaker data.
 */
export async function generateOutputs(
  state: Pick<TranscriptionState, 'edited'>,
  onProgress: ProgressCallback,
  onError: ErrorCallback
): Promise<{ executiveSummary: string; structuredSummary: string; behaviouralSummary: string; remarks: TranscriptionState['outputs']['remarks'] } | null> {
  try {
    onProgress(5, 'Generating summary…');
    const stopTicker = startProgressTicker(onProgress, 'Generating summary…', 5, 95);
    const { executiveSummary, structuredSummary, behaviouralSummary, remarks, warnings } = await generateSummaryAndRemarks(
      state.edited.transcript,
      state.edited.speakers
    );
    stopTicker();

    if (warnings.length > 0) {
      console.warn('Summary warnings:', warnings);
    }

    onProgress(100, 'Done');
    return { executiveSummary, structuredSummary, behaviouralSummary, remarks };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    onError(message);
    await reportError(err, 'generateOutputs');
    return null;
  }
}

/**
 * Saves the transcript + summary to Cloud Storage.
 */
export async function saveToCloudStorage(
  transcript: string,
  executiveSummary: string,
  structuredSummary: string,
  behaviouralSummary: string,
  remarks: { speakerName: string; remark: string }[],
  filename: string,
  onError: ErrorCallback
): Promise<string | null> {
  try {
    const accessToken = await requestAccessToken();
    const remarksText = remarks
      .map((r) => `- ${r.speakerName || 'Speaker'}: ${r.remark}`)
      .join('\n');
    const content = [
      'EXECUTIVE SUMMARY',
      '=================',
      executiveSummary,
      '',
      'STRUCTURED SUMMARY',
      '==================',
      structuredSummary,
      '',
      'BEHAVIOURAL SUMMARY',
      '===================',
      behaviouralSummary,
      '',
      'INDIVIDUAL BEHAVIOURAL REMARKS',
      '==============================',
      remarksText,
      '',
      'TRANSCRIPT',
      '==========',
      transcript,
    ].join('\n');
    const url = await uploadToCloudStorage(content, filename, accessToken);
    return url;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    onError(message);
    await reportError(err, 'saveToCloudStorage');
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Smart file / folder naming
// ─────────────────────────────────────────────────────────────────────────────

const MEETING_TYPE_KEYWORDS: [string[], string][] = [
  [['interview', 'candidate', 'hiring', 'recruit'], 'Interview'],
  [['sales', 'pitch', 'demo', 'prospect', 'proposal'], 'Sales Call'],
  [['onboarding', 'orientation', 'welcome'], 'Onboarding'],
  [['standup', 'stand-up', 'sprint', 'scrum', 'retro', 'retrospective'], 'Team Sync'],
  [['board', 'quarterly', 'earnings', 'investor'], 'Board Meeting'],
  [['training', 'workshop', 'course'], 'Training'],
  [['negotiation', 'contract', 'terms'], 'Negotiation'],
  [['review', 'performance', 'feedback', 'appraisal'], 'Review'],
  [['kickoff', 'kick-off', 'launch'], 'Kickoff'],
  [['support', 'troubleshoot', 'incident'], 'Support Call'],
];

function guessMeetingType(text: string): string {
  const lower = text.toLowerCase();
  for (const [keywords, label] of MEETING_TYPE_KEYWORDS) {
    if (keywords.some((kw) => lower.includes(kw))) return label;
  }
  return 'Meeting';
}

/**
 * Builds a human-readable base name from speaker metadata and the summary.
 * Format: `YYYY-MM-DD [Client] [Stakeholder] [Meeting Type]`
 *
 * Heuristic: the company represented by fewer speakers is treated as the
 * "client"; its speaker with the most transcript entries is the main
 * stakeholder. Falls back gracefully when metadata is sparse.
 */
export function buildExportBaseName(
  speakers: Speaker[],
  transcript: TranscriptEntry[],
  summaryText: string,
): string {
  const date = new Date().toISOString().slice(0, 10);

  // Group speakers by company (ignore blanks)
  const byCompany = new Map<string, Speaker[]>();
  for (const s of speakers) {
    const co = (s.company || '').trim();
    if (!co) continue;
    const arr = byCompany.get(co) ?? [];
    arr.push(s);
    byCompany.set(co, arr);
  }

  let clientName = '';
  let stakeholderName = '';

  if (byCompany.size >= 2) {
    // Company with fewest speakers is likely the client
    const sorted = [...byCompany.entries()].sort((a, b) => a[1].length - b[1].length);
    clientName = sorted[0][0];
    const clientSpeakers = sorted[0][1];

    // Pick the stakeholder who spoke most
    const entryCounts = new Map<string, number>();
    for (const e of transcript) {
      entryCounts.set(e.speakerId, (entryCounts.get(e.speakerId) ?? 0) + 1);
    }
    clientSpeakers.sort(
      (a, b) => (entryCounts.get(b.id) ?? 0) - (entryCounts.get(a.id) ?? 0),
    );
    stakeholderName = clientSpeakers[0]?.name || clientSpeakers[0]?.label || '';
  } else if (byCompany.size === 1) {
    clientName = [...byCompany.keys()][0];
    // Use the speaker who spoke most as stakeholder
    const entryCounts = new Map<string, number>();
    for (const e of transcript) {
      entryCounts.set(e.speakerId, (entryCounts.get(e.speakerId) ?? 0) + 1);
    }
    const sorted = [...speakers].sort(
      (a, b) => (entryCounts.get(b.id) ?? 0) - (entryCounts.get(a.id) ?? 0),
    );
    stakeholderName = sorted[0]?.name || sorted[0]?.label || '';
  } else {
    // No company info – use first two speaker names
    clientName = speakers[0]?.name || speakers[0]?.label || 'Unknown';
    stakeholderName = speakers[1]?.name || speakers[1]?.label || '';
  }

  const meetingType = guessMeetingType(summaryText);

  const parts = [date];
  if (clientName) parts.push(clientName);
  if (stakeholderName) parts.push(stakeholderName);
  parts.push(meetingType);

  return parts.join(' ');
}

// ─────────────────────────────────────────────────────────────────────────────
// Save to Google Drive
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Saves content to Google Drive.
 * – Authenticates the user
 * – Opens a folder picker for the destination
 * – If audio is included, creates a subfolder and uploads both files
 * – Otherwise uploads a single text file
 *
 * Returns the Drive URL of the created file (or folder) or null on cancel.
 */
export async function saveToDrive(
  textContent: string,
  baseName: string,
  audioBase64: string | undefined,
  audioMimeType: string | undefined,
  onError: ErrorCallback,
): Promise<string | null> {
  try {
    const accessToken = await requestAccessToken();

    const folder = await openDriveFolderPicker(accessToken);
    if (!folder) return null; // user cancelled

    const includeAudio = !!(audioBase64 && audioMimeType);

    if (includeAudio) {
      // Create a subfolder
      const subfolderId = await createDriveFolder(baseName, folder.id, accessToken);

      // Upload text
      const textUrl = await uploadToDrive(
        textContent,
        `${baseName}.txt`,
        subfolderId,
        accessToken,
      );

      // Convert base64 to Blob and upload audio
      const audioBytes = Uint8Array.from(atob(audioBase64), (c) => c.charCodeAt(0));
      const ext = mimeToExtension(audioMimeType);
      const audioBlob = new Blob([audioBytes], { type: audioMimeType });
      await uploadBlobToDrive(
        audioBlob,
        `${baseName}.${ext}`,
        audioMimeType,
        subfolderId,
        accessToken,
      );

      return textUrl;
    }

    // Text only – upload directly into the selected folder
    const url = await uploadToDrive(
      textContent,
      `${baseName}.txt`,
      folder.id,
      accessToken,
    );
    return url;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    onError(message);
    await reportError(err, 'saveToDrive');
    return null;
  }
}
