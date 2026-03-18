/// <reference types="vite/client" />

declare const __APP_BUILD_TIME__: number;

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID: string;
  readonly VITE_GOOGLE_APP_ID: string;
  readonly VITE_GOOGLE_API_KEY: string;
  readonly VITE_GEMINI_API_KEY: string;
  readonly VITE_GCS_BUCKET: string;
  readonly VITE_GCP_PROJECT_ID: string;
  readonly VITE_REC_FOLDER_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
