import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranscription } from '../context/useTranscription';
import { getSamplePlaybackDuration } from '../lib/audioProcessing';
import type { Speaker } from '../types';

/**
 * Modal for reassigning a transcript entry to a different speaker.
 *
 * Two-step flow:
 *  1. Pick the new speaker from the list.
 *  2. If the current entry shares its speaker with other entries, ask whether to
 *     reassign only this paragraph or all paragraphs for that speaker.
 */
export const SpeakerModal = React.memo(function SpeakerModal() {
  const { state, dispatch } = useTranscription();
  const { speakerModalOpen, speakerModalEntryId } = state.ui;
  const { speakers, transcript } = state.edited;
  const { audioBase64, mimeType } = state.rawData;
  const overlayRef = useRef<HTMLDivElement>(null);

  // The speaker the user picked in step 1 (null = step 1 is active)
  const [pendingNewSpeakerId, setPendingNewSpeakerId] = useState<string | null>(null);

  // Audio sample playback for the speaker list
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingSpeakerId, setPlayingSpeakerId] = useState<string | null>(null);

  const handlePlaySample = useCallback(
    (e: React.MouseEvent, speaker: Speaker) => {
      e.stopPropagation();
      if (!audioBase64 || !mimeType) return;

      // Stop any currently playing sample
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
        if (playingSpeakerId === speaker.id) {
          setPlayingSpeakerId(null);
          return;
        }
      }

      const duration = getSamplePlaybackDuration(speaker.id, transcript);
      const src = `data:${mimeType};base64,${audioBase64}`;
      const audio = new Audio(src);
      audio.currentTime = speaker.timestamp;

      const stopAt = speaker.timestamp + duration;
      audio.ontimeupdate = () => {
        if (audio.currentTime >= stopAt) {
          audio.pause();
          audioRef.current = null;
          setPlayingSpeakerId(null);
        }
      };
      audio.onended = () => {
        audioRef.current = null;
        setPlayingSpeakerId(null);
      };

      audioRef.current = audio;
      setPlayingSpeakerId(speaker.id);
      audio.play().catch(() => {
        audioRef.current = null;
        setPlayingSpeakerId(null);
      });
    },
    [audioBase64, mimeType, playingSpeakerId, transcript]
  );

  // Stop playback when modal closes
  useEffect(() => {
    if (!speakerModalOpen && audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setPlayingSpeakerId(null);
    }
  }, [speakerModalOpen]);

  // Derive the current speaker of the entry being edited
  const currentEntry = transcript.find((e) => e.id === speakerModalEntryId);
  const currentSpeakerId = currentEntry?.speakerId ?? null;

  // Count how many entries share the current speaker (memoized to avoid re-filtering on every render)
  const siblingCount = useMemo(
    () => transcript.filter((e) => e.speakerId === currentSpeakerId).length,
    [transcript, currentSpeakerId]
  );

  const close = useCallback(() => {
    setPendingNewSpeakerId(null);
    dispatch({ type: 'CLOSE_SPEAKER_MODAL' });
  }, [dispatch]);

  const handleSelect = useCallback(
    (speakerId: string) => {
      if (!speakerModalEntryId) return;
      // If there are other entries with the same speaker, go to step 2
      if (siblingCount > 1) {
        setPendingNewSpeakerId(speakerId);
      } else {
        dispatch({ type: 'REASSIGN_SPEAKER', entryId: speakerModalEntryId, newSpeakerId: speakerId });
      }
    },
    [dispatch, speakerModalEntryId, siblingCount]
  );

  const handleReassignOne = useCallback(() => {
    if (!speakerModalEntryId || !pendingNewSpeakerId) return;
    dispatch({ type: 'REASSIGN_SPEAKER', entryId: speakerModalEntryId, newSpeakerId: pendingNewSpeakerId });
  }, [dispatch, speakerModalEntryId, pendingNewSpeakerId]);

  const handleReassignAll = useCallback(() => {
    if (!currentSpeakerId || !pendingNewSpeakerId) return;
    dispatch({ type: 'REASSIGN_SPEAKER_ALL', oldSpeakerId: currentSpeakerId, newSpeakerId: pendingNewSpeakerId });
  }, [dispatch, currentSpeakerId, pendingNewSpeakerId]);

  // Close on Escape key; back to step 1 when in step 2
  useEffect(() => {
    if (!speakerModalOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (pendingNewSpeakerId) {
          setPendingNewSpeakerId(null);
        } else {
          close();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [speakerModalOpen, pendingNewSpeakerId, close]);

  // Reset step when modal closes
  useEffect(() => {
    if (!speakerModalOpen) setPendingNewSpeakerId(null);
  }, [speakerModalOpen]);

  // Group speakers by company for step 1; named companies first, empty last
  const speakersByCompany = useMemo(() => {
    const groups = new Map<string, Speaker[]>();
    for (const s of speakers) {
      const key = s.company || '';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(s);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => {
      if (!a && b) return 1;
      if (a && !b) return -1;
      return a.localeCompare(b);
    });
  }, [speakers]);

  if (!speakerModalOpen) return null;

  const pendingSpeaker = speakers.find((s) => s.id === pendingNewSpeakerId);
  const currentSpeaker = speakers.find((s) => s.id === currentSpeakerId);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={(e) => {
        if (e.target === overlayRef.current) close();
      }}
    >
      <div className="bg-white rounded-2xl shadow-xl p-6 w-80 max-h-96 overflow-y-auto">
        {pendingNewSpeakerId ? (
          /* ── Step 2: ask scope ── */
          <>
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Change Speaker Scope</h3>
            <p className="text-sm text-gray-500 mb-4">
              Reassign to{' '}
              <span className="font-medium text-gray-700">
                {pendingSpeaker?.name || pendingSpeaker?.label}
              </span>
              :
            </p>
            <div className="space-y-2">
              <button
                onClick={handleReassignOne}
                className="w-full flex flex-col gap-0.5 p-3 rounded-lg border border-gray-200 hover:bg-indigo-50 hover:border-indigo-300 text-left transition-colors"
              >
                <span className="text-sm font-medium text-gray-800">Only this paragraph</span>
                <span className="text-xs text-gray-400">Leave other paragraphs unchanged</span>
              </button>
              <button
                onClick={handleReassignAll}
                className="w-full flex flex-col gap-0.5 p-3 rounded-lg border border-gray-200 hover:bg-indigo-50 hover:border-indigo-300 text-left transition-colors"
              >
                <span className="text-sm font-medium text-gray-800">
                  All paragraphs for{' '}
                  <span style={{ color: currentSpeaker?.color }}>
                    {currentSpeaker?.name || currentSpeaker?.label}
                  </span>
                </span>
                <span className="text-xs text-gray-400">
                  Reassign all {siblingCount} paragraphs currently assigned to this speaker
                </span>
              </button>
            </div>
            <button
              onClick={() => setPendingNewSpeakerId(null)}
              className="mt-4 w-full text-center text-sm text-gray-400 hover:text-gray-600"
            >
              ← Back
            </button>
          </>
        ) : (
          /* ── Step 1: pick speaker ── */
          <>
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Reassign Speaker</h3>
            <div className="space-y-4">
              {speakersByCompany.map(([company, companySpeakers]) => (
                <div key={company || '__no_company__'}>
                  {company && (
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1 px-1">
                      {company}
                    </p>
                  )}
                  <div className="space-y-1">
                    {companySpeakers.map((s) => (
                      <div key={s.id} className="flex items-center gap-1">
                        <button
                          onClick={() => handleSelect(s.id)}
                          className="flex-1 flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 text-left transition-colors"
                        >
                          <div
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: s.color }}
                          />
                          <span className="text-sm font-medium text-gray-700">{s.name || s.label}</span>
                        </button>
                        {audioBase64 && (
                          <button
                            onClick={(e) => handlePlaySample(e, s)}
                            title={playingSpeakerId === s.id ? 'Stop sample' : 'Play sample'}
                            className="p-2 rounded-lg text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 transition-colors flex-shrink-0"
                          >
                            {playingSpeakerId === s.id ? '⏹' : '▶'}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={close}
              className="mt-4 w-full text-center text-sm text-gray-400 hover:text-gray-600"
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
});
