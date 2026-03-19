import React, { useState, useCallback, useEffect, useRef } from 'react';
import { BRAND_RED } from '../lib/constants';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ExportAction = 'copy' | 'download' | 'drive';

export type ExportElement =
  | 'executiveSummary'
  | 'structuredSummary'
  | 'behaviouralSummary'
  | 'remarks'
  | 'transcript';

export interface ExportSelection {
  elements: ExportElement[];
  includeAudio: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Presets
// ─────────────────────────────────────────────────────────────────────────────

interface Preset {
  id: string;
  label: string;
  description: string;
  elements: ExportElement[];
}

const PRESETS: Preset[] = [
  {
    id: 'summaries',
    label: 'Summaries',
    description: 'Executive + Structured summary',
    elements: ['executiveSummary', 'structuredSummary'],
  },
  {
    id: 'summaries-behaviours',
    label: 'Summaries & Behaviours',
    description: 'Summaries + Behavioural analysis',
    elements: ['executiveSummary', 'structuredSummary', 'behaviouralSummary', 'remarks'],
  },
  {
    id: 'full',
    label: 'Full Report',
    description: 'Everything including transcript',
    elements: ['executiveSummary', 'structuredSummary', 'behaviouralSummary', 'remarks', 'transcript'],
  },
  {
    id: 'transcript',
    label: 'Transcript Only',
    description: 'Linear transcript',
    elements: ['transcript'],
  },
];

const ALL_ELEMENTS: { key: ExportElement; label: string }[] = [
  { key: 'executiveSummary', label: '📝 Executive Summary' },
  { key: 'structuredSummary', label: '📊 Structured Summary' },
  { key: 'behaviouralSummary', label: '🧠 Behavioural Summary' },
  { key: 'remarks', label: '💬 Individual Remarks' },
  { key: 'transcript', label: '📄 Transcript' },
];

const ACTION_LABELS: Record<ExportAction, string> = {
  copy: 'Copy to Clipboard',
  download: 'Download',
  drive: 'Save to Drive',
};

const ACTION_ICONS: Record<ExportAction, string> = {
  copy: '📋',
  download: '⬇️',
  drive: '💾',
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function sameElements(a: ExportElement[], b: ExportElement[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

function matchingPresetId(elements: ExportElement[]): string | null {
  for (const p of PRESETS) {
    if (sameElements(p.elements, elements)) return p.id;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

interface ExportContentPickerProps {
  action: ExportAction;
  audioAvailable: boolean;
  onConfirm: (selection: ExportSelection) => void;
  onCancel: () => void;
}

export const ExportContentPicker = React.memo(function ExportContentPicker({
  action,
  audioAvailable,
  onConfirm,
  onCancel,
}: ExportContentPickerProps) {
  const [selectedElements, setSelectedElements] = useState<ExportElement[]>(
    PRESETS[2].elements, // default to "Full Report"
  );
  const [includeAudio, setIncludeAudio] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  const activePreset = matchingPresetId(selectedElements);

  // Audio checkbox is only meaningful for download and drive
  const audioSupported = action === 'download' || action === 'drive';

  const handlePresetClick = useCallback((preset: Preset) => {
    setSelectedElements([...preset.elements]);
  }, []);

  const handleToggleElement = useCallback((key: ExportElement) => {
    setSelectedElements((prev) => {
      if (prev.includes(key)) {
        return prev.filter((e) => e !== key);
      }
      return [...prev, key];
    });
  }, []);

  const hasAudioSelected = audioSupported && includeAudio;

  const handleConfirm = useCallback(() => {
    if (selectedElements.length === 0 && !hasAudioSelected) return;
    onConfirm({ elements: selectedElements, includeAudio: hasAudioSelected });
  }, [selectedElements, hasAudioSelected, onConfirm]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onCancel]);

  // Close on overlay click
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === overlayRef.current) onCancel();
    },
    [onCancel],
  );

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    >
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-800">
            {ACTION_ICONS[action]} {ACTION_LABELS[action]}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Select which parts of the report to include
          </p>
        </div>

        <div className="px-6 py-4 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Preset options */}
          <div>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Presets
            </div>
            <div className="grid grid-cols-2 gap-2">
              {PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => handlePresetClick(preset)}
                  className={`text-left px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                    activePreset === preset.id
                      ? 'border-red-400 bg-red-50 text-red-700'
                      : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <span className="font-medium block">{preset.label}</span>
                  <span className="text-xs text-gray-400 block mt-0.5">{preset.description}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Custom checkboxes */}
          <div>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Custom
            </div>
            <div className="border border-gray-200 rounded-lg bg-gray-50 p-3 space-y-2">
              {ALL_ELEMENTS.map(({ key, label }) => (
                <label
                  key={key}
                  className="flex items-center gap-3 cursor-pointer text-sm text-gray-700 hover:text-gray-900"
                >
                  <input
                    type="checkbox"
                    checked={selectedElements.includes(key)}
                    onChange={() => handleToggleElement(key)}
                    className="h-4 w-4 rounded border-gray-300 text-red-500 focus:ring-red-400"
                  />
                  {label}
                </label>
              ))}

              {/* Audio checkbox */}
              {audioSupported && (
                <label
                  className={`flex items-center gap-3 text-sm border-t border-gray-200 pt-2 mt-2 ${
                    audioAvailable
                      ? 'cursor-pointer text-gray-700 hover:text-gray-900'
                      : 'cursor-not-allowed text-gray-400'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={includeAudio}
                    onChange={() => setIncludeAudio((v) => !v)}
                    disabled={!audioAvailable}
                    className="h-4 w-4 rounded border-gray-300 text-red-500 focus:ring-red-400"
                  />
                  🔊 Include audio recording
                  {!audioAvailable && (
                    <span className="text-xs text-gray-400 ml-auto">(not available)</span>
                  )}
                </label>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={selectedElements.length === 0 && !hasAudioSelected}
            className="px-5 py-2 text-sm rounded-lg font-semibold text-white shadow hover:opacity-90 transition-opacity disabled:opacity-50"
            style={{ backgroundColor: BRAND_RED }}
          >
            {ACTION_LABELS[action]}
          </button>
        </div>
      </div>
    </div>
  );
});
