import { describe, it, expect } from 'vitest';
import { mimeToExtension, extensionToMime } from './mimeUtils';

describe('mimeToExtension', () => {
  it('returns correct extension for a known MIME type', () => {
    expect(mimeToExtension('audio/mp4')).toBe('m4a');
    expect(mimeToExtension('audio/mpeg')).toBe('mp3');
    expect(mimeToExtension('video/mp4')).toBe('mp4');
    expect(mimeToExtension('audio/x-caf')).toBe('caf');
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

describe('extensionToMime', () => {
  it('returns correct MIME type for common audio extensions', () => {
    expect(extensionToMime('recording.mp3')).toBe('audio/mpeg');
    expect(extensionToMime('recording.wav')).toBe('audio/wav');
    expect(extensionToMime('recording.m4a')).toBe('audio/mp4');
    expect(extensionToMime('recording.aac')).toBe('audio/aac');
    expect(extensionToMime('recording.ogg')).toBe('audio/ogg');
    expect(extensionToMime('recording.flac')).toBe('audio/flac');
    expect(extensionToMime('recording.webm')).toBe('audio/webm');
    expect(extensionToMime('recording.opus')).toBe('audio/opus');
    expect(extensionToMime('recording.caf')).toBe('audio/x-caf');
  });

  it('returns correct MIME type for common video extensions', () => {
    expect(extensionToMime('video.mp4')).toBe('video/mp4');
    expect(extensionToMime('video.mov')).toBe('video/quicktime');
    expect(extensionToMime('video.avi')).toBe('video/x-msvideo');
    expect(extensionToMime('video.mkv')).toBe('video/x-matroska');
    expect(extensionToMime('video.ogv')).toBe('video/ogg');
  });

  it('is case-insensitive for the extension', () => {
    expect(extensionToMime('recording.MP3')).toBe('audio/mpeg');
    expect(extensionToMime('recording.WAV')).toBe('audio/wav');
  });

  it('falls back to application/octet-stream for unknown extensions', () => {
    expect(extensionToMime('file.xyz')).toBe('application/octet-stream');
    expect(extensionToMime('noextension')).toBe('application/octet-stream');
  });
});
