// ─────────────────────────────────────────────────────────────────────────────
// Google API credentials
// ─────────────────────────────────────────────────────────────────────────────
export const CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''; // OAuth 2.0 client ID

export const API_KEY =
  import.meta.env.VITE_GOOGLE_API_KEY ?? ''; // Google API key (Drive / GCS)

export const GEMINI_API_KEY =
  import.meta.env.VITE_GEMINI_API_KEY ?? ''; // Gemini generative AI key

export const GCS_BUCKET =
  import.meta.env.VITE_GCS_BUCKET ?? 'smart-transcription-outputs';

// Bucket and prefix used for raw microphone recordings
export const RECORDINGS_BUCKET = 'mtp-storage';
export const RECORDINGS_PREFIX = 'Recordings/';

export const GCP_PROJECT_ID =
  import.meta.env.VITE_GCP_PROJECT_ID ?? '';

// ─────────────────────────────────────────────────────────────────────────────
// OAuth scopes
// ─────────────────────────────────────────────────────────────────────────────
export const SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/devstorage.read_write',
].join(' ');

// ─────────────────────────────────────────────────────────────────────────────
// Google Picker
// ─────────────────────────────────────────────────────────────────────────────
export const DISCOVERY_DOCS = [
  'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest',
];

// ─────────────────────────────────────────────────────────────────────────────
// Gemini model
// ─────────────────────────────────────────────────────────────────────────────
export const GEMINI_MODEL = 'gemini-1.5-pro';

// ─────────────────────────────────────────────────────────────────────────────
// Speaker colour palette (consistent hashing)
// ─────────────────────────────────────────────────────────────────────────────
export const SPEAKER_COLORS = [
  '#4f46e5', // indigo
  '#0891b2', // cyan
  '#059669', // emerald
  '#d97706', // amber
  '#dc2626', // red
  '#7c3aed', // violet
  '#db2777', // pink
  '#ea580c', // orange
  '#16a34a', // green
  '#2563eb', // blue
];

// ─────────────────────────────────────────────────────────────────────────────
// App branding
// ─────────────────────────────────────────────────────────────────────────────
export const BRAND_RED = '#fe0101';

// ─────────────────────────────────────────────────────────────────────────────
// Debounce delays
// ─────────────────────────────────────────────────────────────────────────────
export const SPEAKER_EDIT_DEBOUNCE_MS = 800;

// ─────────────────────────────────────────────────────────────────────────────
// Timestamp validation
// ─────────────────────────────────────────────────────────────────────────────
export const TIMESTAMP_MISMATCH_THRESHOLD_S = 3; // > 3s mismatch = hallucination

// ─────────────────────────────────────────────────────────────────────────────
// Local storage keys
// ─────────────────────────────────────────────────────────────────────────────
export const LS_STATE_KEY = 'smart_transcription_state';
