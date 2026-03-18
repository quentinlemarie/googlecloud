/**
 * Converts seconds to a human-readable MM:SS or HH:MM:SS string.
 */
export function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Parses a MM:SS or HH:MM:SS string back to seconds.
 * Returns NaN if the string is invalid.
 */
export function parseTime(value: string): number {
  const parts = value.split(':').map(Number);
  if (parts.some(isNaN)) return NaN;
  if (parts.length === 2) {
    const [m, s] = parts;
    return (m ?? 0) * 60 + (s ?? 0);
  }
  if (parts.length === 3) {
    const [h, m, s] = parts;
    return (h ?? 0) * 3600 + (m ?? 0) * 60 + (s ?? 0);
  }
  return NaN;
}
