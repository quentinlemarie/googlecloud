import React, { useCallback, useRef, useEffect } from 'react';
import { useTranscription } from '../context/useTranscription';
import { saveToCloudStorage } from '../lib/pipeline';
import { BRAND_RED } from '../lib/constants';

interface ExportMenuProps {
  transcriptText: string;
}

export const ExportMenu = React.memo(function ExportMenu({ transcriptText }: ExportMenuProps) {
  const { state, dispatch } = useTranscription();
  const { exportMenuOpen } = state.ui;
  const menuRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    if (!exportMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        dispatch({ type: 'SET_EXPORT_MENU_OPEN', open: false });
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [exportMenuOpen, dispatch]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(transcriptText).catch(() => {});
    dispatch({ type: 'SET_EXPORT_MENU_OPEN', open: false });
  }, [transcriptText, dispatch]);

  const handleDownload = useCallback(() => {
    const blob = new Blob([transcriptText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcript-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    dispatch({ type: 'SET_EXPORT_MENU_OPEN', open: false });
  }, [transcriptText, dispatch]);

  const handleSaveToCloud = useCallback(async () => {
    dispatch({ type: 'SET_EXPORT_MENU_OPEN', open: false });
    const url = await saveToCloudStorage(
      transcriptText,
      state.outputs.summary,
      `transcript-${Date.now()}.txt`,
      (message) => dispatch({ type: 'SET_ERROR', message })
    );
    if (url) {
      dispatch({ type: 'SET_CLOUD_STORAGE_URL', url });
    }
  }, [transcriptText, state.outputs.summary, dispatch]);

  const handleNotebookLM = useCallback(() => {
    // NotebookLM deep link with transcript as source
    const encoded = encodeURIComponent(transcriptText.slice(0, 2000));
    const url = `https://notebooklm.google.com/?source=${encoded}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    dispatch({ type: 'SET_NOTEBOOK_LM_URL', url });
    dispatch({ type: 'SET_EXPORT_MENU_OPEN', open: false });
  }, [transcriptText, dispatch]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => dispatch({ type: 'SET_EXPORT_MENU_OPEN', open: !exportMenuOpen })}
        className="px-4 py-2 rounded-lg font-semibold text-white text-sm shadow hover:opacity-90 transition-opacity"
        style={{ backgroundColor: BRAND_RED }}
      >
        Export ▾
      </button>

      {exportMenuOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-xl shadow-lg z-40 overflow-hidden">
          <button
            onClick={handleCopy}
            className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-50"
          >
            📋 Copy to clipboard
          </button>
          <button
            onClick={handleDownload}
            className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-50"
          >
            ⬇️ Download .txt
          </button>
          <button
            onClick={handleSaveToCloud}
            className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-50"
          >
            ☁️ Save to Cloud Storage
          </button>
          <button
            onClick={handleNotebookLM}
            className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-50"
          >
            📓 Open in NotebookLM
          </button>
        </div>
      )}
    </div>
  );
});
