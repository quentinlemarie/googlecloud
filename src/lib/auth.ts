import { CLIENT_ID, SCOPES } from './constants';
import type { TokenResponse } from '../types/google.d.ts';

const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client';

/**
 * Ensures the Google Identity Services script is loaded.
 * If the script tag already exists in the DOM (added via index.html), it waits
 * for it to finish loading. Otherwise it injects and loads it dynamically.
 */
function loadGoogleIdentityServices(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${GIS_SCRIPT_URL}"]`
    );

    if (existing) {
      // The script tag already exists (injected via index.html).
      // The 'load' event fires only once; if it already fired before we
      // attached our listener the promise would hang forever.
      // Poll briefly for the google object so we don't miss an already-loaded script.
      let attempts = 0;
      const MAX_ATTEMPTS = 100; // 5s at 50ms intervals
      const poll = () => {
        if (window.google?.accounts?.oauth2) {
          resolve();
          return;
        }
        attempts++;
        if (attempts >= MAX_ATTEMPTS) {
          reject(new Error('Google Identity Services failed to load. Check your connection and try again.'));
          return;
        }
        setTimeout(poll, 50);
      };

      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Identity Services')), { once: true });

      // Also start polling immediately in case the script already loaded
      poll();
      return;
    }

    const script = document.createElement('script');
    script.src = GIS_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(script);
  });
}

/**
 * Promise-based wrapper around Google Identity Services token client.
 *
 * Key fix: the callback is assigned BEFORE `requestAccessToken()` is called,
 * eliminating the race condition that caused Drive login to redirect fullscreen.
 *
 * @returns Promise that resolves with an OAuth access token string.
 * @throws  Error with user-friendly message on failure or popup block.
 */
export async function requestAccessToken(): Promise<string> {
  await loadGoogleIdentityServices();

  return new Promise<string>((resolve, reject) => {
    if (!window.google?.accounts?.oauth2) {
      reject(new Error('Google Identity Services not loaded. Please refresh the page.'));
      return;
    }

    // Build the client first so we can assign the callback synchronously
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      // Placeholder – replaced immediately below before any request fires
      callback: () => {},
    });

    // Assign the real callback BEFORE calling requestAccessToken
    tokenClient.callback = (response: TokenResponse) => {
      if (response.error) {
        reject(
          new Error(
            response.error_description ??
              `OAuth error: ${response.error}`
          )
        );
        return;
      }
      if (!response.access_token) {
        reject(new Error('No access token returned by Google OAuth'));
        return;
      }
      resolve(response.access_token);
    };

    try {
      // Request token in popup mode (no redirect)
      tokenClient.requestAccessToken({ prompt: '' });
    } catch {
      // Popup blocked – surface a clear message
      reject(
        new Error(
          'Popup was blocked. Please allow popups for this site and try again.'
        )
      );
    }
  });
}
