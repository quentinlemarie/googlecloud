import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BRAND_RED, RECORDINGS_PREFIX } from '../lib/constants';
import { listRecordings, downloadRecordingBlob } from '../lib/storage';
import { requestAccessToken } from '../lib/auth';
import type { RecordingItem } from '../lib/storage';

interface RecordingsLibraryProps {
  onClose: () => void;
  onUse: (file: File) => void;
}

/** Format bytes to a human-readable string (e.g. "2.3 MB"). */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Format an ISO date string to a short localised representation. */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const RecordingsLibrary = React.memo(function RecordingsLibrary({
  onClose,
  onUse,
}: RecordingsLibraryProps) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const [recordings, setRecordings] = useState<RecordingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [usingId, setUsingId] = useState<string | null>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Fetch recordings on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const accessToken = await requestAccessToken();
        const items = await listRecordings(accessToken);
        if (!cancelled) setRecordings(items);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : 'Failed to load recordings.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleDownload = useCallback(async (item: RecordingItem) => {
    setDownloadingId(item.name);
    try {
      const accessToken = await requestAccessToken();
      const blob = await downloadRecordingBlob(item.name, accessToken);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = item.displayName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Delay revocation to ensure the browser has started the download
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed.');
    } finally {
      setDownloadingId(null);
    }
  }, []);

  const handleUse = useCallback(async (item: RecordingItem) => {
    setUsingId(item.name);
    try {
      const accessToken = await requestAccessToken();
      const blob = await downloadRecordingBlob(item.name, accessToken);
      const file = new File([blob], item.displayName, { type: item.contentType });
      onUse(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load recording.');
      setUsingId(null);
    }
  }, [onUse]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-800">📼 My Recordings</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none transition-colors"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-4">
          {loading && (
            <p className="text-center text-gray-500 py-8">Loading recordings…</p>
          )}

          {!loading && error && (
            <p className="text-center text-red-500 py-4 text-sm">{error}</p>
          )}

          {!loading && !error && recordings.length === 0 && (
            <div className="text-center py-8">
              <span className="text-5xl block mb-3">🎙️</span>
              <p className="text-gray-500 text-sm">
                No recordings found in{' '}
                <span className="font-mono text-xs bg-gray-100 px-1 py-0.5 rounded">
                  mtp-storage/{RECORDINGS_PREFIX}
                </span>
              </p>
            </div>
          )}

          {!loading && !error && recordings.length > 0 && (
            <ul className="space-y-3">
              {recordings.map((item) => {
                const busy = downloadingId === item.name || usingId === item.name;
                return (
                  <li
                    key={item.name}
                    className="flex flex-col sm:flex-row sm:items-center gap-3 bg-gray-50 rounded-xl p-4"
                  >
                    <div className="flex-1 min-w-0">
                      <p
                        className="font-medium text-gray-800 text-sm truncate"
                        title={item.displayName}
                      >
                        {item.displayName}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {formatDate(item.timeCreated)} · {formatSize(item.size)}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {/* Download */}
                      <button
                        onClick={() => handleDownload(item)}
                        disabled={busy}
                        title="Download recording"
                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-100 disabled:opacity-50 transition-colors"
                      >
                        {downloadingId === item.name ? '…' : '⬇ Download'}
                      </button>

                      {/* Use / Transcribe */}
                      <button
                        onClick={() => handleUse(item)}
                        disabled={busy}
                        title="Re-transcribe this recording"
                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-white shadow-sm disabled:opacity-50 transition-opacity hover:opacity-90"
                        style={{ backgroundColor: BRAND_RED }}
                      >
                        {usingId === item.name ? 'Loading…' : '▶ Use'}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
});
