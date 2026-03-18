import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { uploadFileToGemini } from './gemini';

// ─────────────────────────────────────────────────────────────────────────────
// uploadFileToGemini
// ─────────────────────────────────────────────────────────────────────────────

describe('uploadFileToGemini', () => {
  const FILE_URI = 'https://generativelanguage.googleapis.com/v1beta/files/abc123';
  // Minimal valid base64 (3 bytes → 4 base64 chars)
  const BASE64_DATA = btoa('abc');
  const MIME_TYPE = 'audio/webm';

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the file URI on success', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ file: { uri: FILE_URI, state: 'ACTIVE' } }), { status: 200 }),
    );

    const uri = await uploadFileToGemini(BASE64_DATA, MIME_TYPE);
    expect(uri).toBe(FILE_URI);
  });

  it('sends a POST request to the Gemini File API upload endpoint with the API key', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ file: { uri: FILE_URI } }), { status: 200 }),
    );

    await uploadFileToGemini(BASE64_DATA, MIME_TYPE);

    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/^https:\/\/generativelanguage\.googleapis\.com\/upload\/v1beta\/files\?key=/);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['X-Goog-Upload-Protocol']).toBe('multipart');
  });

  it('throws an error when the API returns a non-ok status', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('{"error":{"code":403,"message":"PERMISSION_DENIED"}}', { status: 403 }),
    );

    await expect(uploadFileToGemini(BASE64_DATA, MIME_TYPE)).rejects.toThrow(
      'Gemini File API upload error 403',
    );
  });

  it('throws an error when the response contains no file URI', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ file: {} }), { status: 200 }),
    );

    await expect(uploadFileToGemini(BASE64_DATA, MIME_TYPE)).rejects.toThrow(
      'Gemini File API did not return a file URI',
    );
  });
});
