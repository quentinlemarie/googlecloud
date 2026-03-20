// ─────────────────────────────────────────────────────────────────────────────
// Pipeline stages & status
// ─────────────────────────────────────────────────────────────────────────────
export type PipelineStage = 'INIT' | 'LOADING' | 'REVIEW' | 'SUMMARIZING' | 'DONE';
export type PipelineStatus = 'idle' | 'running' | 'error';

// ─────────────────────────────────────────────────────────────────────────────
// Speaker / transcript types
// ─────────────────────────────────────────────────────────────────────────────
export interface Speaker {
  id: string;
  label: string;        // e.g. "Speaker 1"
  name: string;
  role: string;
  company: string;
  color: string;        // Tailwind CSS colour class or hex
  timestamp: number;    // First appearance in seconds
  audioSampleUrl?: string;
  confidence?: number;  // 0-1 confidence from validation
}

export interface TranscriptEntry {
  id: string;
  speakerId: string;
  text: string;
  startTime: number;   // seconds
  endTime: number;     // seconds
}

export interface TranscriptGroup {
  speakerId: string;
  entries: TranscriptEntry[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Raw AI outputs (immutable after fetch)
// ─────────────────────────────────────────────────────────────────────────────
export interface RawData {
  audioFileUrl: string | null;
  transcript: TranscriptEntry[];
  speakers: Speaker[];
  /** Base64-encoded audio – transient, not persisted to localStorage */
  audioBase64?: string;
  /** MIME type of the audio – transient, not persisted to localStorage */
  mimeType?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// User-edited data
// ─────────────────────────────────────────────────────────────────────────────
export interface EditedData {
  speakers: Speaker[];
  transcript: TranscriptEntry[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Generated outputs
// ─────────────────────────────────────────────────────────────────────────────
export interface Outputs {
  executiveSummary: string;
  structuredSummary: string;
  behaviouralSummary: string;
  remarks: SpeakerRemark[];
  cloudStorageUrl: string | null;
}

export interface SpeakerRemark {
  speakerId: string;
  speakerName: string;
  remark: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Output language
// ─────────────────────────────────────────────────────────────────────────────
export type OutputLanguage = 'en' | 'fr';

// ─────────────────────────────────────────────────────────────────────────────
// UI state
// ─────────────────────────────────────────────────────────────────────────────
export interface UIState {
  speakerModalOpen: boolean;
  speakerModalEntryId: string | null;
  exportMenuOpen: boolean;
  transcriptEditMode: boolean;
  errorMessage: string | null;
  outputLanguage: OutputLanguage;
}

// ─────────────────────────────────────────────────────────────────────────────
// Top-level app state
// ─────────────────────────────────────────────────────────────────────────────
export interface TranscriptionState {
  pipeline: {
    stage: PipelineStage;
    status: PipelineStatus;
    progress: number;   // 0-100
    message: string;
  };
  rawData: RawData;
  edited: EditedData;
  outputs: Outputs;
  ui: UIState;
}

// ─────────────────────────────────────────────────────────────────────────────
// Audio source options
// ─────────────────────────────────────────────────────────────────────────────
export type AudioSource = 'drive' | 'upload' | 'microphone';

// ─────────────────────────────────────────────────────────────────────────────
// Validation result
// ─────────────────────────────────────────────────────────────────────────────
export interface ValidationResult<T> {
  data: T;
  confidence: number;
  warnings: string[];
}
