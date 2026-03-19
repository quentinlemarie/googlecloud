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
  return MIME_TO_EXT[mimeType] ?? mimeType.split('/').pop()?.replace('x-', '') ?? 'bin';
}
