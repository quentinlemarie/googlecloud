import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// requestAccessToken – CLIENT_ID guard
// ─────────────────────────────────────────────────────────────────────────────

describe('requestAccessToken', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('throws a user-friendly error when CLIENT_ID is not configured', async () => {
    vi.doMock('./constants', () => ({
      CLIENT_ID: '',
      SCOPES: 'https://www.googleapis.com/auth/drive.readonly',
    }));

    const { requestAccessToken } = await import('./auth');
    await expect(requestAccessToken()).rejects.toThrow(
      'Google OAuth client ID is not configured.'
    );
  });

  it('does not throw the client-ID error when CLIENT_ID is set', async () => {
    vi.doMock('./constants', () => ({
      CLIENT_ID: 'my-client-id.apps.googleusercontent.com',
      SCOPES: 'https://www.googleapis.com/auth/drive.readonly',
    }));

    // Stub window.google so the function proceeds past the GIS check
    Object.defineProperty(global, 'window', {
      value: {
        google: {
          accounts: {
            oauth2: {
              initTokenClient: vi.fn(() => ({
                callback: vi.fn(),
                requestAccessToken: vi.fn(),
              })),
            },
          },
        },
        document: global.document,
      },
      writable: true,
      configurable: true,
    });

    const { requestAccessToken } = await import('./auth');

    // We only verify no "client ID not configured" error is thrown;
    // the promise will remain pending (no real GIS), so we race with a timeout.
    const TEST_TIMEOUT_MS = 200;
    const result = await Promise.race([
      requestAccessToken().catch((err: Error) => err),
      new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), TEST_TIMEOUT_MS)),
    ]);

    if (result instanceof Error) {
      expect(result.message).not.toContain('Google OAuth client ID is not configured');
    }
    // if result === 'timeout' the function is pending – that's acceptable here
  });
});
