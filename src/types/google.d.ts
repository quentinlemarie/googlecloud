// Shared global type augmentations for Google APIs loaded via script tags
declare global {
  interface Window {
    // Removed the '?' so TypeScript allows us to construct classes directly
    // (e.g. new window.google.picker.PickerBuilder())
    google: GoogleNamespace;
    gapi: GapiNamespace;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Google Identity Services & Picker
// ─────────────────────────────────────────────────────────────────────────────
export interface TokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
}

export interface TokenClient {
  requestAccessToken: (options?: { prompt?: string }) => void;
  // GIS allows overriding the callback on the client instance dynamically
  callback?: (response: TokenResponse) => void;
}

export interface GooglePickerBuilder {
  addView: (view: GooglePickerDocsView) => GooglePickerBuilder;
  setOAuthToken: (token: string) => GooglePickerBuilder;
  setAppId: (appId: string) => GooglePickerBuilder;
  setDeveloperKey: (key: string) => GooglePickerBuilder;
  setCallback: (fn: (data: GooglePickerResponse) => void) => GooglePickerBuilder;
  setOrigin: (origin: string) => GooglePickerBuilder;
  setTitle: (title: string) => GooglePickerBuilder;
  enableFeature: (feature: string) => GooglePickerBuilder;
  build: () => { setVisible: (v: boolean) => void };
}

export interface GooglePickerDocsView {
  setMimeTypes: (types: string) => GooglePickerDocsView;
  setMode: (mode: string) => GooglePickerDocsView;
  setIncludeFolders: (include: boolean) => GooglePickerDocsView;
  setLabel: (label: string) => GooglePickerDocsView;
  setParent: (folderId: string) => GooglePickerDocsView;
}

export interface GooglePickerResponse {
  action: string;
  docs?: { id: string; name: string; mimeType: string }[];
}

export interface GoogleNamespace {
  accounts: {
    oauth2: {
      initTokenClient: (config: {
        client_id: string;
        scope: string;
        // CRITICAL FIX: ux_mode must be included so TypeScript allows the popup fix!
        ux_mode?: 'popup' | 'redirect'; 
        callback?: (response: TokenResponse) => void;
        error_callback?: (error: unknown) => void;
      }) => TokenClient;
    };
  };
  picker: {
    PickerBuilder: new () => GooglePickerBuilder;
    DocsView: new (viewId?: string) => GooglePickerDocsView;
    Action: { PICKED: string; CANCEL: string };
    DocsViewMode: { LIST: string; GRID: string };
    ViewId: { DOCS: string };
    Feature: { SUPPORT_DRIVES: string };
  };
}

export interface GapiNamespace {
  load: (
    libs: string, 
    callback: (() => void) | { callback: () => void; onerror: (err: unknown) => void }
  ) => void;
  client: {
    init: (config: { 
      apiKey?: string; 
      discoveryDocs?: string[]; 
      clientId?: string; 
      scope?: string;
    }) => Promise<void>;
  };
}
