import React, { useMemo, useState, useCallback } from 'react';
import { useTranscription } from '../context/useTranscription';
import { TranscriptViewer } from './TranscriptViewer';
import { SpeakerGroup } from './SpeakerGroup';
import { SpeakerModal } from './SpeakerModal';
import { Header } from './Header';
import { ChatBox } from './ChatBox';
import { BRAND_RED } from '../lib/constants';

// ─────────────────────────────────────────────────────────────────────────────
// Reusable collapsible section wrapper
// ─────────────────────────────────────────────────────────────────────────────
interface CollapsibleProps {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  indent?: boolean;
}

function Collapsible({ title, open, onToggle, children, indent = false }: CollapsibleProps) {
  return (
    <div className={indent ? 'ml-4' : ''}>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-2 py-2 text-left group"
      >
        <span
          className={
            indent
              ? 'text-base font-semibold text-gray-700 group-hover:text-gray-900'
              : 'text-lg font-bold group-hover:opacity-80'
          }
          style={indent ? undefined : { color: BRAND_RED }}
        >
          {title}
        </span>
        <span className="text-gray-400 text-sm flex-shrink-0">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Simple inline markdown renderer (bullet points + bold, no extra deps)
// ─────────────────────────────────────────────────────────────────────────────
function MarkdownText({ text }: { text: string }) {
  if (!text) return null;
  const lines = text.split('\n');
  return (
    <div className="space-y-1 text-sm text-gray-700">
      {lines.map((line, i) => {
        const bulletMatch = line.match(/^(\s*)-\s+(.+)/);
        if (bulletMatch) {
          const depth = Math.floor(bulletMatch[1].length / 2);
          return (
            <div key={i} className="flex gap-2" style={{ paddingLeft: `${depth * 16}px` }}>
              <span className="flex-shrink-0 text-gray-500">•</span>
              <span>{bulletMatch[2]}</span>
            </div>
          );
        }
        if (line.trim() === '') return <div key={i} className="h-1" />;
        return (
          <p key={i} className="font-medium text-gray-800">
            {line}
          </p>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main OutputPage
// ─────────────────────────────────────────────────────────────────────────────
export const OutputPage = React.memo(function OutputPage() {
  const { state } = useTranscription();
  const { executiveSummary, structuredSummary, behaviouralSummary, remarks } = state.outputs;
  const { speakers, transcript } = state.edited;

  // ── Section open/closed state ───────────────────────────────────────────
  // Parent sections
  const [summariesOpen, setSummariesOpen] = useState(true);
  const [behOpen, setBehOpen] = useState(true);
  const [transcriptsOpen, setTranscriptsOpen] = useState(false);

  // Sub-sections
  const [execOpen, setExecOpen] = useState(true);       // 1.1 Executive Summary – open
  const [structOpen, setStructOpen] = useState(false);  // 1.2 Structured Summary – collapsed
  const [behSumOpen, setBehSumOpen] = useState(true);   // 2.1 Behavioural Summary – open
  const [indivOpen, setIndivOpen] = useState(false);    // 2.2 Individual Behavioural – collapsed
  const [linearOpen, setLinearOpen] = useState(false);  // 3.1 Linear Transcript – collapsed
  const [groupedOpen, setGroupedOpen] = useState(false); // 3.2 Speaker-grouped – collapsed

  // ── Speaker groups for the grouped transcript ───────────────────────────
  const speakerGroups = useMemo(() => {
    const groups: Record<string, typeof transcript> = {};
    for (const entry of transcript) {
      if (!groups[entry.speakerId]) groups[entry.speakerId] = [];
      groups[entry.speakerId]!.push(entry);
    }
    return groups;
  }, [transcript]);

  // ── Toggle helpers ───────────────────────────────────────────────────────
  const toggleSummaries = useCallback(() => setSummariesOpen((v) => !v), []);
  const toggleBeh = useCallback(() => setBehOpen((v) => !v), []);
  const toggleTranscripts = useCallback(() => setTranscriptsOpen((v) => !v), []);
  const toggleExec = useCallback(() => setExecOpen((v) => !v), []);
  const toggleStruct = useCallback(() => setStructOpen((v) => !v), []);
  const toggleBehSum = useCallback(() => setBehSumOpen((v) => !v), []);
  const toggleIndiv = useCallback(() => setIndivOpen((v) => !v), []);
  const toggleLinear = useCallback(() => setLinearOpen((v) => !v), []);
  const toggleGrouped = useCallback(() => setGroupedOpen((v) => !v), []);

  return (
    <>
      <Header />

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-4">

        {/* ── 1. Summaries ─────────────────────────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <Collapsible title="1. Summaries" open={summariesOpen} onToggle={toggleSummaries}>
            <div className="space-y-3 pt-1">

              {/* 1.1 Executive Summary */}
              <Collapsible title="1.1 Executive Summary" open={execOpen} onToggle={toggleExec} indent>
                {executiveSummary ? (
                  <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-700 whitespace-pre-wrap">
                    {executiveSummary}
                  </div>
                ) : (
                  <p className="text-gray-400 italic text-sm">No executive summary available.</p>
                )}
              </Collapsible>

              {/* 1.2 Structured Summary */}
              <Collapsible title="1.2 Structured Summary" open={structOpen} onToggle={toggleStruct} indent>
                {structuredSummary ? (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <MarkdownText text={structuredSummary} />
                  </div>
                ) : (
                  <p className="text-gray-400 italic text-sm">No structured summary available.</p>
                )}
              </Collapsible>

            </div>
          </Collapsible>
        </div>

        {/* ── 2. Behavioural Analysis ──────────────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <Collapsible title="2. Behavioural Analysis" open={behOpen} onToggle={toggleBeh}>
            <div className="space-y-3 pt-1">

              {/* 2.1 Behavioural Summary */}
              <Collapsible title="2.1 Behavioural Summary" open={behSumOpen} onToggle={toggleBehSum} indent>
                {behaviouralSummary ? (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <MarkdownText text={behaviouralSummary} />
                  </div>
                ) : (
                  <p className="text-gray-400 italic text-sm">No behavioural summary available.</p>
                )}
              </Collapsible>

              {/* 2.2 Individual Behavioural */}
              <Collapsible title="2.2 Individual Behavioural" open={indivOpen} onToggle={toggleIndiv} indent>
                {remarks.length > 0 ? (
                  <div className="space-y-3">
                    {remarks.map((r, idx) => {
                      const speaker = speakers.find((s) => s.id === r.speakerId);
                      const name = r.speakerName || speaker?.name || speaker?.label || r.speakerId;
                      const color = speaker?.color ?? '#888';
                      return (
                        <div
                          key={idx}
                          className="bg-gray-50 border border-gray-200 rounded-lg p-4 flex gap-3"
                        >
                          <div
                            className="w-2 rounded-full flex-shrink-0 self-stretch"
                            style={{ backgroundColor: color }}
                          />
                          <div>
                            <p className="text-sm font-semibold text-gray-700">{name}</p>
                            <p className="text-sm text-gray-600 mt-1">{r.remark}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-gray-400 italic text-sm">No individual remarks available.</p>
                )}
              </Collapsible>

            </div>
          </Collapsible>
        </div>

        {/* ── 3. Transcripts ───────────────────────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <Collapsible title="3. Transcripts" open={transcriptsOpen} onToggle={toggleTranscripts}>
            <div className="space-y-3 pt-1">

              {/* 3.1 Linear Transcript */}
              <Collapsible title="3.1 Linear Transcript" open={linearOpen} onToggle={toggleLinear} indent>
                <div className="bg-gray-50 rounded-lg p-4">
                  <TranscriptViewer />
                </div>
              </Collapsible>

              {/* 3.2 Speaker-grouped Transcript */}
              <Collapsible title="3.2 Speaker-grouped Transcript" open={groupedOpen} onToggle={toggleGrouped} indent>
                <div className="bg-gray-50 rounded-lg p-4">
                  {speakers.map((speaker) => (
                    <SpeakerGroup
                      key={speaker.id}
                      speaker={speaker}
                      entries={speakerGroups[speaker.id] ?? []}
                    />
                  ))}
                </div>
              </Collapsible>

            </div>
          </Collapsible>
        </div>

        {/* Cloud Storage link */}
        {state.outputs.cloudStorageUrl && (
          <section className="text-sm text-gray-500">
            Saved to Cloud Storage:{' '}
            <a
              href={state.outputs.cloudStorageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-600 underline"
            >
              {state.outputs.cloudStorageUrl}
            </a>
          </section>
        )}

        {/* ── Ask about this meeting ──────────────────────────────────── */}
        <ChatBox />

      </main>

      <SpeakerModal />
    </>
  );
});

