/**
 * Maps a MIME type to a common file extension.
 * Falls back to 'bin' for unrecognised types.
 */
const MIME_TO_EXT: Record<string, string> = {
  // Audio
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/m4a': 'm4a',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/flac': 'flac',
  'audio/aac': 'aac',
  'audio/x-aac': 'aac',
  'audio/x-caf': 'caf',
  // Video
  'video/mp4': 'mp4',
  'video/mpeg': 'mpeg',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'video/x-msvideo': 'avi',
  'video/ogg': 'ogv',
  'video/3gpp': '3gp',
  'video/x-matroska': 'mkv',
  // Text / data
  'text/plain': 'txt',
  'application/json': 'json',
};

export function mimeToExtension(mimeType: string): string {
  // Strip codec parameters (e.g. "audio/mp4;codecs=mp4a.40.2" → "audio/mp4")
  const base = mimeType.split(';')[0];
  return MIME_TO_EXT[base] ?? base.split('/').pop()?.replace('x-', '') ?? 'bin';
}

/**
 * Maps a file extension (with or without leading dot) to a MIME type.
 * Falls back to 'application/octet-stream' for unrecognised extensions.
 */
const EXT_TO_MIME: Record<string, string> = {
  // Audio
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
  webm: 'audio/webm',
  opus: 'audio/opus',
  wma: 'audio/x-ms-wma',
  caf: 'audio/x-caf',
  // Video
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  mkv: 'video/x-matroska',
  m4v: 'video/mp4',
  ogv: 'video/ogg',
  '3gp': 'video/3gpp',
};

export function extensionToMime(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return EXT_TO_MIME[ext] ?? 'application/octet-stream';
}
