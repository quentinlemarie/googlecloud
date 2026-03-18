import { GCS_BUCKET, RECORDINGS_BUCKET, RECORDINGS_PREFIX, API_KEY, GOOGLE_APP_ID, REC_FOLDER_ID, PLACEHOLDER_FOLDER_ID } from './constants';
import type { GooglePickerResponse } from '../types/google.d.ts';

const GAPI_SCRIPT_URL = 'https://apis.google.com/js/api.js';

/**
 * Ensures the Google API client library and the Picker module are loaded.
 * The script tag may already be present (added via index.html); if so it waits
 * for it to finish. Otherwise the script is injected dynamically.
 */
function loadGooglePicker(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.picker) {
      resolve();
      return;
    }

    const initPicker = () => {
      window.gapi!.load('picker', {
        callback: () => resolve(),
        onerror: () => reject(new Error('Failed to load Google Picker module')),
      });
    };

    if (window.gapi) {
      initPicker();
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${GAPI_SCRIPT_URL}"]`
    );

    if (existing) {
      existing.addEventListener('load', initPicker, { once: true });
      existing.addEventListener('error', () => reject(new Error('Failed to load Google API library')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = GAPI_SCRIPT_URL;
    script.async = true;
    script.onload = initPicker;
    script.onerror = () => reject(new Error('Failed to load Google API library'));
    document.head.appendChild(script);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Cloud Storage
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Uploads a text blob to Google Cloud Storage and returns the public URL.
 */
export async function uploadToCloudStorage(
  content: string,
  filename: string,
  accessToken: string,
  contentType = 'text/plain'
): Promise<string> {
  const blob = new Blob([content], { type: contentType });
  const url = `https://storage.googleapis.com/upload/storage/v1/b/${GCS_BUCKET}/o?uploadType=media&name=${encodeURIComponent(filename)}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': contentType,
    },
    body: blob,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Cloud Storage upload failed (${response.status}): ${text}`);
  }

  return `https://storage.googleapis.com/${GCS_BUCKET}/${encodeURIComponent(filename)}`;
}

/**
 * Uploads a raw audio Blob (e.g. a microphone recording) directly to
 * `mtp-storage/Recordings/<filename>` and returns the GCS object URL.
 *
 * The upload uses the GCS JSON API `uploadType=media` (single-request upload),
 * which is appropriate for files up to ~5 MB. For longer recordings the
 * browser's MediaRecorder typically produces larger files – those are handled
 * fine as well because the browser streams the request body.
 */
export async function uploadRecordingBlob(
  blob: Blob,
  filename: string,
  accessToken: string,
): Promise<string> {
  const objectName = `${RECORDINGS_PREFIX}${filename}`;
  const uploadUrl =
    `https://storage.googleapis.com/upload/storage/v1/b/${RECORDINGS_BUCKET}/o` +
    `?uploadType=media&name=${encodeURIComponent(objectName)}`;

  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': blob.type,
    },
    body: blob,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Recording upload failed (${response.status}): ${text}`);
  }

  return (
    `https://storage.googleapis.com/${RECORDINGS_BUCKET}/` +
    encodeURIComponent(objectName)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Google Drive Picker
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Opens the Google Drive file picker and resolves with the selected file ID,
 * or null if the user cancels.
 */
export async function openDrivePicker(accessToken: string): Promise<{ id: string; name: string } | null> {
  await loadGooglePicker();

  return new Promise((resolve) => {
    const picker_ns = window.google!.picker!;

    const mediaView = new picker_ns.DocsView(picker_ns.ViewId.DOCS)
      // List every concrete MIME type we want to surface.  Google Picker's
      // setMimeTypes() does not support wildcards (e.g. "audio/*"), so we
      // enumerate the common audio and video formats explicitly.
      .setMimeTypes(
        'audio/mpeg,audio/mp4,audio/x-m4a,audio/m4a,audio/wav,audio/webm,' +
        'audio/ogg,audio/flac,audio/aac,audio/x-aac,' +
        'video/mp4,video/mpeg,video/quicktime,video/webm,video/x-msvideo,' +
        'video/ogg,video/3gpp,video/x-matroska'
      )
      .setMode(picker_ns.DocsViewMode.LIST)
      .setLabel('Media (Audio/Video)');

    const allFilesView = new picker_ns.DocsView(picker_ns.ViewId.DOCS)
      .setIncludeFolders(true)
      .setMode(picker_ns.DocsViewMode.LIST)
      .setLabel('Full Drive Browsing');

    if (REC_FOLDER_ID && REC_FOLDER_ID !== PLACEHOLDER_FOLDER_ID) {
      allFilesView.setParent(REC_FOLDER_ID);
    } else {
      allFilesView.setParent('root');
    }

    console.log({ token: accessToken ? '[set]' : undefined, API_KEY, GOOGLE_APP_ID });

    const picker = new picker_ns.PickerBuilder()
      .addView(mediaView)
      .addView(allFilesView)
      .setOAuthToken(accessToken)
      .setAppId(GOOGLE_APP_ID)
      .setDeveloperKey(API_KEY)
      .setOrigin(window.location.protocol + '//' + window.location.host)
      .enableFeature(picker_ns.Feature.SUPPORT_DRIVES)
      .setTitle('Select Meeting Media')
      .setCallback((data: GooglePickerResponse) => {
        if (data.action === picker_ns.Action.PICKED && data.docs && data.docs.length > 0) {
          resolve({ id: data.docs[0].id, name: data.docs[0].name });
        } else if (data.action === picker_ns.Action.CANCEL) {
          resolve(null);
        }
      })
      .build();

    picker.setVisible(true);
  });
}

/**
 * Downloads a Google Drive file and returns it as a base64-encoded string.
 */
export async function downloadDriveFile(
  fileId: string,
  accessToken: string
): Promise<{ data: string; mimeType: string }> {
  // First get the file metadata to know the mime type
  const metaResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=mimeType,name`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!metaResponse.ok) {
    throw new Error(`Failed to fetch Drive file metadata: ${metaResponse.status}`);
  }

  const meta = (await metaResponse.json()) as { mimeType: string };

  // Download the file content
  const fileResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!fileResponse.ok) {
    throw new Error(`Failed to download Drive file: ${fileResponse.status}`);
  }

  const arrayBuffer = await fileResponse.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const chunks: string[] = [];
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + chunkSize)));
  }
  const base64 = btoa(chunks.join(''));

  return { data: base64, mimeType: meta.mimeType };
}
