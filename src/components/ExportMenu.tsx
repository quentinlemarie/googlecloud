import React, { useCallback, useMemo, useRef, useEffect } from 'react';
import { useTranscription } from '../context/useTranscription';
import { saveToCloudStorage } from '../lib/pipeline';
import { BRAND_RED } from '../lib/constants';

// ─────────────────────────────────────────────────────────────────────────────
// Content builders
// ─────────────────────────────────────────────────────────────────────────────

function buildLinearTranscript(
  transcript: { speakerId: string; text: string }[],
  speakerMap: Record<string, string>
): string {
  return transcript.map((e) => `[${speakerMap[e.speakerId] ?? e.speakerId}]: ${e.text}`).join('\n');
}

function buildSummariesText(executiveSummary: string, structuredSummary: string): string {
  return [
    'EXECUTIVE SUMMARY',
    '=================',
    executiveSummary,
    '',
    'STRUCTURED SUMMARY',
    '==================',
    structuredSummary,
  ].join('\n');
}

function buildBehaviouralText(
  behaviouralSummary: string,
  remarks: { speakerName: string; remark: string }[]
): string {
  const remarksText = remarks
    .map((r) => `- ${r.speakerName || 'Speaker'}: ${r.remark}`)
    .join('\n');
  return [
    'BEHAVIOURAL SUMMARY',
    '===================',
    behaviouralSummary,
    '',
    'INDIVIDUAL BEHAVIOURAL REMARKS',
    '==============================',
    remarksText,
  ].join('\n');
}

function downloadText(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export const ExportMenu = React.memo(function ExportMenu() {
  const { state, dispatch } = useTranscription();
  const { exportMenuOpen } = state.ui;
  const { executiveSummary, structuredSummary, behaviouralSummary, remarks } = state.outputs;
  const { speakers, transcript } = state.edited;
  const menuRef = useRef<HTMLDivElement>(null);

  const speakerMap = useMemo(
    () => Object.fromEntries(speakers.map((s) => [s.id, s.name || s.label])),
    [speakers]
  );

  const linearTranscript = useMemo(
    () => buildLinearTranscript(transcript, speakerMap),
    [transcript, speakerMap]
  );

  const dateSlug = new Date().toISOString().slice(0, 10);

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

  const close = useCallback(
    () => dispatch({ type: 'SET_EXPORT_MENU_OPEN', open: false }),
    [dispatch]
  );

  // ── Download handlers ──────────────────────────────────────────────────

  const handleDownloadSummaries = useCallback(() => {
    downloadText(buildSummariesText(executiveSummary, structuredSummary), `summaries-${dateSlug}.txt`);
    close();
  }, [executiveSummary, structuredSummary, dateSlug, close]);

  const handleDownloadSummariesAndBeh = useCallback(() => {
    const content = [
      buildSummariesText(executiveSummary, structuredSummary),
      '',
      buildBehaviouralText(behaviouralSummary, remarks),
    ].join('\n');
    downloadText(content, `summaries-behaviours-${dateSlug}.txt`);
    close();
  }, [executiveSummary, structuredSummary, behaviouralSummary, remarks, dateSlug, close]);

  const handleDownloadFull = useCallback(() => {
    const content = [
      buildSummariesText(executiveSummary, structuredSummary),
      '',
      buildBehaviouralText(behaviouralSummary, remarks),
      '',
      'LINEAR TRANSCRIPT',
      '=================',
      linearTranscript,
    ].join('\n');
    downloadText(content, `full-report-${dateSlug}.txt`);
    close();
  }, [executiveSummary, structuredSummary, behaviouralSummary, remarks, linearTranscript, dateSlug, close]);

  const handleDownloadTranscript = useCallback(() => {
    downloadText(
      ['LINEAR TRANSCRIPT', '=================', linearTranscript].join('\n'),
      `transcript-${dateSlug}.txt`
    );
    close();
  }, [linearTranscript, dateSlug, close]);

  // ── Other actions ──────────────────────────────────────────────────────

  const handleCopy = useCallback(() => {
    const content = [
      buildSummariesText(executiveSummary, structuredSummary),
      '',
      buildBehaviouralText(behaviouralSummary, remarks),
      '',
      'LINEAR TRANSCRIPT',
      '=================',
      linearTranscript,
    ].join('\n');
    navigator.clipboard.writeText(content).catch(() => {});
    close();
  }, [executiveSummary, structuredSummary, behaviouralSummary, remarks, linearTranscript, close]);

  const handleSaveToCloud = useCallback(async () => {
    close();
    const url = await saveToCloudStorage(
      linearTranscript,
      executiveSummary,
      structuredSummary,
      behaviouralSummary,
      remarks,
      `transcript-${Date.now()}.txt`,
      (message) => dispatch({ type: 'SET_ERROR', message })
    );
    if (url) {
      dispatch({ type: 'SET_CLOUD_STORAGE_URL', url });
    }
  }, [linearTranscript, executiveSummary, structuredSummary, behaviouralSummary, remarks, dispatch, close]);

  const handleNotebookLM = useCallback(() => {
    const encoded = encodeURIComponent(linearTranscript.slice(0, 2000));
    const url = `https://notebooklm.google.com/?source=${encoded}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    dispatch({ type: 'SET_NOTEBOOK_LM_URL', url });
    close();
  }, [linearTranscript, dispatch, close]);

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
        <div className="absolute right-0 mt-2 w-72 bg-white border border-gray-200 rounded-xl shadow-lg z-40 overflow-hidden">
          {/* Download options */}
          <div className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100">
            Download
          </div>
          <button
            onClick={handleDownloadSummaries}
            className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-50"
          >
            📄 Summaries
            <span className="block text-xs text-gray-400">Executive + Structured summary</span>
          </button>
          <button
            onClick={handleDownloadSummariesAndBeh}
            className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-50"
          >
            📊 Summaries &amp; Behaviours
            <span className="block text-xs text-gray-400">Summaries + Behavioural analysis</span>
          </button>
          <button
            onClick={handleDownloadFull}
            className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-50"
          >
            📋 Summaries, Behaviours &amp; Transcript
            <span className="block text-xs text-gray-400">Full report with linear transcript</span>
          </button>
          <button
            onClick={handleDownloadTranscript}
            className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 border-b border-gray-100"
          >
            🗒️ Transcript only
            <span className="block text-xs text-gray-400">Linear transcript</span>
          </button>

          {/* Other actions */}
          <div className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100">
            Other
          </div>
          <button
            onClick={handleCopy}
            className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-50"
          >
            📋 Copy full report to clipboard
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

