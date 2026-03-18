import { CLIENT_ID, SCOPES } from './constants';
import type { TokenResponse } from '../types/google.d.ts';

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
