import React, { useCallback, useMemo, useRef, useEffect, useState } from 'react';
import { useTranscription } from '../context/useTranscription';
import { saveToDrive, buildExportBaseName } from '../lib/pipeline';
import { BRAND_RED } from '../lib/constants';
import { mimeToExtension } from '../utils/mimeUtils';
import {
  ExportContentPicker,
  type ExportAction,
  type ExportElement,
  type ExportSelection,
} from './ExportContentPicker';

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

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────────────────────
// Build text from selected elements
// ─────────────────────────────────────────────────────────────────────────────

function buildContentFromSelection(
  elements: ExportElement[],
  executiveSummary: string,
  structuredSummary: string,
  behaviouralSummary: string,
  remarks: { speakerName: string; remark: string }[],
  linearTranscript: string,
): string {
  const sections: string[] = [];

  if (elements.includes('executiveSummary') && elements.includes('structuredSummary')) {
    sections.push(buildSummariesText(executiveSummary, structuredSummary));
  } else {
    if (elements.includes('executiveSummary')) {
      sections.push(['EXECUTIVE SUMMARY', '=================', executiveSummary].join('\n'));
    }
    if (elements.includes('structuredSummary')) {
      sections.push(['STRUCTURED SUMMARY', '==================', structuredSummary].join('\n'));
    }
  }

  if (elements.includes('behaviouralSummary') || elements.includes('remarks')) {
    if (elements.includes('behaviouralSummary') && elements.includes('remarks')) {
      sections.push(buildBehaviouralText(behaviouralSummary, remarks));
    } else if (elements.includes('behaviouralSummary')) {
      sections.push(['BEHAVIOURAL SUMMARY', '===================', behaviouralSummary].join('\n'));
    } else {
      const remarksText = remarks
        .map((r) => `- ${r.speakerName || 'Speaker'}: ${r.remark}`)
        .join('\n');
      sections.push(['INDIVIDUAL BEHAVIOURAL REMARKS', '==============================', remarksText].join('\n'));
    }
  }

  if (elements.includes('transcript')) {
    sections.push(['LINEAR TRANSCRIPT', '=================', linearTranscript].join('\n'));
  }

  return sections.join('\n\n');
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

  const [pickerAction, setPickerAction] = useState<ExportAction | null>(null);

  const speakerMap = useMemo(
    () => Object.fromEntries(speakers.map((s) => [s.id, s.name || s.label])),
    [speakers]
  );

  const linearTranscript = useMemo(
    () => buildLinearTranscript(transcript, speakerMap),
    [transcript, speakerMap]
  );

  const audioAvailable = !!(state.rawData.audioBase64 && state.rawData.mimeType);

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

  // ── Open content picker for an action ──────────────────────────────────

  const openPicker = useCallback((action: ExportAction) => {
    close();
    setPickerAction(action);
  }, [close]);

  const closePicker = useCallback(() => {
    setPickerAction(null);
  }, []);

  // ── Execute export after content selection ─────────────────────────────

  const handleExport = useCallback(
    async (selection: ExportSelection) => {
      setPickerAction(null);

      const action = pickerAction!;
      const content = buildContentFromSelection(
        selection.elements,
        executiveSummary,
        structuredSummary,
        behaviouralSummary,
        remarks,
        linearTranscript,
      );

      const summaryText = [executiveSummary, structuredSummary].join(' ');
      const baseName = buildExportBaseName(speakers, transcript, summaryText);

      switch (action) {
        case 'copy':
          navigator.clipboard.writeText(content).catch(() => {});
          break;

        case 'download': {
          downloadText(content, `${baseName}.txt`);
          // If audio is included, download it as a separate file
          if (selection.includeAudio && state.rawData.audioBase64 && state.rawData.mimeType) {
            const audioBytes = Uint8Array.from(
              atob(state.rawData.audioBase64),
              (c) => c.charCodeAt(0),
            );
            const ext = mimeToExtension(state.rawData.mimeType);
            const audioBlob = new Blob([audioBytes], { type: state.rawData.mimeType });
            downloadBlob(audioBlob, `${baseName}.${ext}`);
          }
          break;
        }

        case 'drive': {
          const audioBase64 = selection.includeAudio ? state.rawData.audioBase64 : undefined;
          const audioMimeType = selection.includeAudio ? state.rawData.mimeType : undefined;
          const url = await saveToDrive(
            content,
            baseName,
            audioBase64,
            audioMimeType,
            (message) => dispatch({ type: 'SET_ERROR', message }),
          );
          if (url) {
            dispatch({ type: 'SET_CLOUD_STORAGE_URL', url });
          }
          break;
        }

        case 'notebooklm': {
          const encoded = encodeURIComponent(content.slice(0, 2000));
          const url = `https://notebooklm.google.com/?source=${encoded}`;
          window.open(url, '_blank', 'noopener,noreferrer');
          dispatch({ type: 'SET_NOTEBOOK_LM_URL', url });
          break;
        }
      }
    },
    [
      pickerAction,
      executiveSummary,
      structuredSummary,
      behaviouralSummary,
      remarks,
      linearTranscript,
      speakers,
      transcript,
      state.rawData.audioBase64,
      state.rawData.mimeType,
      dispatch,
    ],
  );

  return (
    <>
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => dispatch({ type: 'SET_EXPORT_MENU_OPEN', open: !exportMenuOpen })}
          className="px-4 py-2 rounded-lg font-semibold text-white text-sm shadow hover:opacity-90 transition-opacity"
          style={{ backgroundColor: BRAND_RED }}
        >
          Export ▾
        </button>

        {exportMenuOpen && (
          <div className="absolute right-0 mt-2 w-64 bg-white border border-gray-200 rounded-xl shadow-lg z-40 overflow-hidden">
            <button
              onClick={() => openPicker('copy')}
              className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
            >
              📋 Copy to Clipboard
            </button>
            <button
              onClick={() => openPicker('download')}
              className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 border-t border-gray-100"
            >
              ⬇️ Download
            </button>
            <button
              onClick={() => openPicker('drive')}
              className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 border-t border-gray-100"
            >
              💾 Save to Drive
            </button>
            <button
              onClick={() => openPicker('notebooklm')}
              className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 border-t border-gray-100"
            >
              📓 Open in NotebookLM
            </button>
          </div>
        )}
      </div>

      {/* Content picker modal */}
      {pickerAction && (
        <ExportContentPicker
          action={pickerAction}
          audioAvailable={audioAvailable}
          onConfirm={handleExport}
          onCancel={closePicker}
        />
      )}
    </>
  );
});


