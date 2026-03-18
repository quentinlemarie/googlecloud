// Shared global type augmentations for Google APIs loaded via script tags
declare global {
  interface Window {
    google?: GoogleNamespace;
    gapi?: GapiNamespace;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Google Identity Services & Picker
// ─────────────────────────────────────────────────────────────────────────────
export interface TokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

export interface TokenClient {
  requestAccessToken: (options?: { prompt?: string }) => void;
  callback: (response: TokenResponse) => void;
}

export interface GooglePickerBuilder {
  addView: (view: GooglePickerDocsView) => GooglePickerBuilder;
  setOAuthToken: (token: string) => GooglePickerBuilder;
  setCallback: (fn: (data: GooglePickerResponse) => void) => GooglePickerBuilder;
  build: () => { setVisible: (v: boolean) => void };
}

export interface GooglePickerDocsView {
  setMimeTypes?: (types: string) => GooglePickerDocsView;
}

export interface GooglePickerResponse {
  action: string;
  docs?: { id: string; name: string; mimeType: string }[];
}

export interface GoogleNamespace {
  accounts?: {
    oauth2: {
      initTokenClient: (config: {
        client_id: string;
        scope: string;
        callback: (response: TokenResponse) => void;
      }) => TokenClient;
    };
  };
  picker?: {
    PickerBuilder: new () => GooglePickerBuilder;
    DocsView: new () => GooglePickerDocsView;
    Action: { PICKED: string };
  };
}

export interface GapiNamespace {
  load: (libs: string, callback: () => void) => void;
  client?: {
    init: (config: { apiKey: string; discoveryDocs: string[] }) => Promise<void>;
  };
}
