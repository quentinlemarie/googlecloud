import { CLIENT_ID, SCOPES } from './constants';
import type { TokenResponse } from '../types/google.d.ts';

const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client';

// ─────────────────────────────────────────────────────────────────────────────
// Token cache
// ─────────────────────────────────────────────────────────────────────────────
// Google access tokens are valid for ~3 600 s.  We cache the token both
// in-memory AND in sessionStorage so the user is only prompted once per
// browser session (or when the token actually expires).  A 60-second safety
// margin ensures we never hand out a token that will expire mid-request.
// ─────────────────────────────────────────────────────────────────────────────
const SS_TOKEN_KEY = 'gauth_access_token';
const SS_EXPIRY_KEY = 'gauth_token_expires_at';
const TOKEN_EXPIRY_MARGIN_MS = 60_000; // refresh 60 s before actual expiry

let _cachedToken: string | null = null;
let _tokenExpiresAt = 0; // epoch-ms

/** Restore token from sessionStorage on module load (survives page refresh). */
function _hydrateFromSession(): void {
  try {
    const token = sessionStorage.getItem(SS_TOKEN_KEY);
    const expiry = sessionStorage.getItem(SS_EXPIRY_KEY);
    if (token && expiry) {
      const expiresAt = Number(expiry);
      if (Date.now() < expiresAt - TOKEN_EXPIRY_MARGIN_MS) {
        _cachedToken = token;
        _tokenExpiresAt = expiresAt;
      } else {
        // Expired – clean up
        sessionStorage.removeItem(SS_TOKEN_KEY);
        sessionStorage.removeItem(SS_EXPIRY_KEY);
      }
    }
  } catch {
    // sessionStorage unavailable (e.g. incognito quota exceeded) – ignore
  }
}
_hydrateFromSession();

/** Persist the current token to sessionStorage. */
function _persistToSession(): void {
  try {
    if (_cachedToken) {
      sessionStorage.setItem(SS_TOKEN_KEY, _cachedToken);
      sessionStorage.setItem(SS_EXPIRY_KEY, String(_tokenExpiresAt));
    }
  } catch {
    // sessionStorage unavailable – cache stays in-memory only
  }
}

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
 * Returns a valid Google OAuth access token, reusing a cached token when
 * possible so the user is only prompted once per session.
 *
 * On the very first call the account-chooser popup is shown.  Subsequent calls
 * silently return the cached token until it expires (minus a safety margin),
 * at which point GIS is asked for a fresh token with `prompt: ''` so the
 * browser can renew silently using the existing grant.
 *
 * @returns Promise that resolves with an OAuth access token string.
 * @throws  Error with user-friendly message on failure or popup block.
 */
export async function requestAccessToken(): Promise<string> {
  if (!CLIENT_ID) {
    throw new Error(
      'Google OAuth is not configured. Please set the VITE_GOOGLE_CLIENT_ID environment variable.'
    );
  }

  // Return cached token if it's still valid
  if (_cachedToken && Date.now() < _tokenExpiresAt - TOKEN_EXPIRY_MARGIN_MS) {
    return _cachedToken;
  }

  await loadGoogleIdentityServices();

  // Determine whether this is the very first auth or a silent renewal.
  // First time → show account picker so the user can choose which account.
  // Renewal   → use empty prompt so GIS can renew silently.
  const isFirstAuth = _cachedToken === null;

  return new Promise<string>((resolve, reject) => {
    if (!window.google?.accounts?.oauth2) {
      reject(new Error('Google Identity Services not loaded. Please refresh the page.'));
      return;
    }

    // Build the client first so we can assign the callback synchronously.
    // ux_mode: 'popup' is required to prevent GIS from falling back to the
    // redirect flow in environments where popups are restricted (e.g. some
    // mobile browsers).  Without this the OAuth handshake uses a full-page
    // redirect and Google returns "Error 400: redirect_uri_mismatch" because
    // no redirect URI is registered for this app.
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      ux_mode: 'popup',
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

      // Cache the token and compute its expiration time
      _cachedToken = response.access_token;
      const expiresInMs = (response.expires_in ?? 3600) * 1000;
      _tokenExpiresAt = Date.now() + expiresInMs;
      _persistToSession();

      resolve(response.access_token);
    };

    try {
      tokenClient.requestAccessToken({
        prompt: isFirstAuth ? 'select_account' : '',
      });
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

/**
 * Returns the currently cached access token if it is still valid, or `null`
 * if no token is cached / the token has expired.  Does NOT trigger a popup.
 */
export function getAccessToken(): string | null {
  if (_cachedToken && Date.now() < _tokenExpiresAt - TOKEN_EXPIRY_MARGIN_MS) {
    return _cachedToken;
  }
  return null;
}

/**
 * Clears the cached token, forcing a fresh authentication on the next call.
 * Useful for sign-out flows or when a 401 response indicates the token is
 * revoked.
 */
export function clearAccessToken(): void {
  _cachedToken = null;
  _tokenExpiresAt = 0;
  try {
    sessionStorage.removeItem(SS_TOKEN_KEY);
    sessionStorage.removeItem(SS_EXPIRY_KEY);
  } catch {
    // sessionStorage unavailable – ignore
  }
}
