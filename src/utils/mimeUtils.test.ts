import { describe, it, expect } from 'vitest';
import { mimeToExtension } from './mimeUtils';

describe('mimeToExtension', () => {
  it('returns correct extension for a known MIME type', () => {
    expect(mimeToExtension('audio/mp4')).toBe('m4a');
    expect(mimeToExtension('audio/mpeg')).toBe('mp3');
    expect(mimeToExtension('video/mp4')).toBe('mp4');
  });

  it('strips codec parameters before lookup', () => {
    expect(mimeToExtension('audio/mp4;codecs=mp4a.40.2')).toBe('m4a');
    expect(mimeToExtension('audio/webm;codecs=opus')).toBe('webm');
    expect(mimeToExtension('video/webm;codecs=vp9')).toBe('webm');
  });

  it('falls back to subtype for unknown MIME types', () => {
    expect(mimeToExtension('audio/xyz')).toBe('xyz');
  });

  it('strips x- prefix in fallback', () => {
    expect(mimeToExtension('audio/x-custom')).toBe('custom');
  });
});
