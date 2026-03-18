import type { TranscriptionState, Speaker, TranscriptEntry } from '../types';
import { transcribeAudio } from './gemini';
import { generateSummaryAndRemarks } from './gemini';
import { uploadToCloudStorage, downloadDriveFile, openDrivePicker } from './storage';
import { requestAccessToken } from './auth';
import { reportError } from './errorReporting';

export type ProgressCallback = (progress: number, message: string) => void;
export type ErrorCallback = (message: string) => void;

// ─────────────────────────────────────────────────────────────────────────────
// Convert a File or Blob to base64
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
    onProgress(10, 'Reading audio file…');
    const audioBase64 = await fileToBase64(file);
    const mimeType = file.type || 'audio/webm';

    onProgress(30, 'Transcribing and identifying speakers…');
    const { speakers, transcript, warnings } = await transcribeAudio(audioBase64, mimeType);

    if (warnings.length > 0) {
      console.warn('Transcription warnings:', warnings);
    }

    onProgress(90, 'Cleaning up…');
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
    onProgress(5, 'Authenticating with Google…');
    const accessToken = await requestAccessToken();

    onProgress(10, 'Opening Drive picker…');
    const selected = await openDrivePicker(accessToken);
    if (!selected) return null;

    onProgress(20, `Downloading "${selected.name}" from Drive…`);
    const { data, mimeType } = await downloadDriveFile(selected.id, accessToken);

    onProgress(35, 'Transcribing…');
    const { speakers, transcript, warnings } = await transcribeAudio(data, mimeType);

    if (warnings.length > 0) {
      console.warn('Transcription warnings:', warnings);
    }

    onProgress(90, 'Cleaning up…');
    return { speakers, transcript, audioBase64: data, mimeType };
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
): Promise<{ summary: string; remarks: TranscriptionState['outputs']['remarks'] } | null> {
  try {
    onProgress(10, 'Generating summary…');
    const { summary, remarks, warnings } = await generateSummaryAndRemarks(
      state.edited.transcript,
      state.edited.speakers
    );

    if (warnings.length > 0) {
      console.warn('Summary warnings:', warnings);
    }

    onProgress(100, 'Done');
    return { summary, remarks };
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
  summary: string,
  filename: string,
  onError: ErrorCallback
): Promise<string | null> {
  try {
    const accessToken = await requestAccessToken();
    const content = `SUMMARY\n=======\n${summary}\n\nTRANSCRIPT\n==========\n${transcript}`;
    const url = await uploadToCloudStorage(content, filename, accessToken);
    return url;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    onError(message);
    await reportError(err, 'saveToCloudStorage');
    return null;
  }
}
