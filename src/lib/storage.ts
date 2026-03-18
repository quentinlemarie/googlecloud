import { GCS_BUCKET } from './constants';
import type { GooglePickerResponse } from '../types/google.d.ts';

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

// ─────────────────────────────────────────────────────────────────────────────
// Google Drive Picker
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Opens the Google Drive file picker and resolves with the selected file ID,
 * or null if the user cancels.
 */
export async function openDrivePicker(accessToken: string): Promise<{ id: string; name: string } | null> {
  return new Promise((resolve) => {
    if (!window.google?.picker) {
      resolve(null);
      return;
    }

    const view = new window.google.picker.DocsView();
    if (view.setMimeTypes) {
      view.setMimeTypes('audio/*');
    }

    const picker = new window.google.picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(accessToken)
      .setCallback((data: GooglePickerResponse) => {
        if (data.action === window.google!.picker!.Action.PICKED && data.docs?.[0]) {
          resolve({ id: data.docs[0].id, name: data.docs[0].name });
        } else {
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
  const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

  return { data: base64, mimeType: meta.mimeType };
}
