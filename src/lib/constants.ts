// ─────────────────────────────────────────────────────────────────────────────
// Google API credentials
// ─────────────────────────────────────────────────────────────────────────────
// All sensitive values must be supplied via environment variables.
// Copy .env.example to .env and fill in your credentials before running.
export const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

// REQUIRED for Google Drive Picker
export const GOOGLE_APP_ID = import.meta.env.VITE_GOOGLE_APP_ID || '';

export const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY || '';

export const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';

// REQUIRED for GCP Error Reporting
export const GCP_PROJECT_ID = import.meta.env.VITE_GCP_PROJECT_ID || '';

// Sentinel value used to detect unconfigured folder ID
export const PLACEHOLDER_FOLDER_ID = 'YOUR_FOLDER_ID_HERE';

// Optional: Default folder for Drive Picker
// When not set (or set to the placeholder), the picker falls back to root.
export const REC_FOLDER_ID = import.meta.env.VITE_REC_FOLDER_ID || PLACEHOLDER_FOLDER_ID;

export const GCS_BUCKET = import.meta.env.VITE_GCS_BUCKET || 'mtp-storage';

// Bucket and prefix used for raw microphone recordings
export const RECORDINGS_BUCKET = 'mtp-storage';
export const RECORDINGS_PREFIX = 'Recordings/';

// ─────────────────────────────────────────────────────────────────────────────
// OAuth scopes
// ─────────────────────────────────────────────────────────────────────────────
export const SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.file',
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
export const GEMINI_MODEL = 'gemini-3.1-pro-preview';

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

// Build time stamp injected by Vite at build time. Changes on every new build
// so that stale localStorage state from a previous deployment is discarded.
export const APP_BUILD_TIME: number = __APP_BUILD_TIME__;
