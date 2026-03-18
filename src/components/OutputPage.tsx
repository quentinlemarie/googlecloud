import React, { useMemo } from 'react';
import { useTranscription } from '../context/useTranscription';
import { TranscriptViewer } from './TranscriptViewer';
import { SpeakerGroup } from './SpeakerGroup';
import { SpeakerModal } from './SpeakerModal';
import { Header } from './Header';
import { BRAND_RED } from '../lib/constants';

export const OutputPage = React.memo(function OutputPage() {
  const { state } = useTranscription();
  const { summary, remarks } = state.outputs;
  const { speakers, transcript } = state.edited;

  // Build speaker groups
  const speakerGroups = useMemo(() => {
    const groups: Record<string, typeof transcript> = {};
    for (const entry of transcript) {
      if (!groups[entry.speakerId]) groups[entry.speakerId] = [];
      groups[entry.speakerId]!.push(entry);
    }
    return groups;
  }, [transcript]);

  // Plain text transcript for export
  const transcriptText = useMemo(() => {
    const speakerMap = Object.fromEntries(speakers.map((s) => [s.id, s.name || s.label]));
    return transcript
      .map((e) => `[${speakerMap[e.speakerId] ?? e.speakerId}]: ${e.text}`)
      .join('\n');
  }, [transcript, speakers]);

  return (
    <>
      <Header transcriptText={transcriptText} />

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-10">
        {/* Summary */}
        <section>
          <h2 className="text-xl font-bold mb-3" style={{ color: BRAND_RED }}>
            Meeting Summary
          </h2>
          {summary ? (
            <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm text-gray-700 whitespace-pre-wrap">
              {summary}
            </div>
          ) : (
            <p className="text-gray-400 italic">No summary available.</p>
          )}
        </section>

        {/* Behavioural Remarks */}
        {remarks.length > 0 && (
          <section>
            <h2 className="text-xl font-bold mb-3" style={{ color: BRAND_RED }}>
              Behavioural Remarks
            </h2>
            <div className="space-y-3">
              {remarks.map((r, idx) => {
                const speaker = speakers.find((s) => s.id === r.speakerId);
                const name = r.speakerName || speaker?.name || speaker?.label || r.speakerId;
                const color = speaker?.color ?? '#888';
                return (
                  <div
                    key={idx}
                    className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex gap-3"
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
          </section>
        )}

        {/* Speaker Groups */}
        <section>
          <h2 className="text-xl font-bold mb-4" style={{ color: BRAND_RED }}>
            By Speaker
          </h2>
          {speakers.map((speaker) => (
            <SpeakerGroup
              key={speaker.id}
              speaker={speaker}
              entries={speakerGroups[speaker.id] ?? []}
            />
          ))}
        </section>

        {/* Full Transcript */}
        <section className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <TranscriptViewer />
        </section>

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
      </main>

      {/* Speaker reassignment modal */}
      <SpeakerModal />
    </>
  );
});
