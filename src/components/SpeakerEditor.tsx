import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Speaker } from '../types';
import { useTranscription } from '../context/useTranscription';
import { useDebounce } from '../hooks/useDebounce';
import { SPEAKER_EDIT_DEBOUNCE_MS } from '../lib/constants';
import { getSamplePlaybackDuration } from '../lib/audioProcessing';

interface SpeakerEditorProps {
  speaker: Speaker;
  audioBase64?: string;
  mimeType?: string;
}

/**
 * Debounced speaker editor.
 * - Local input state is separate from context state to avoid re-grouping mid-type
 * - Changes are committed to context after 800ms debounce or on blur/enter
 * - Shows a "●" indicator when pending edits exist
 */
export const SpeakerEditor = React.memo(function SpeakerEditor({
  speaker,
  audioBase64,
  mimeType,
}: SpeakerEditorProps) {
  const { state, dispatch } = useTranscription();

  // Local "draft" state – updated on every keystroke
  const [name, setName] = useState(speaker.name);
  const [role, setRole] = useState(speaker.role);
  const [company, setCompany] = useState(speaker.company);

  // Sync local state if the speaker data changes from outside (e.g., undo)
  useEffect(() => {
    setName(speaker.name);
    setRole(speaker.role);
    setCompany(speaker.company);
  }, [speaker.name, speaker.role, speaker.company]);

  // Debounced values – only update context after the user pauses typing
  const debouncedName = useDebounce(name, SPEAKER_EDIT_DEBOUNCE_MS);
  const debouncedRole = useDebounce(role, SPEAKER_EDIT_DEBOUNCE_MS);
  const debouncedCompany = useDebounce(company, SPEAKER_EDIT_DEBOUNCE_MS);

  // Track whether any pending changes haven't flushed yet
  const hasPending =
    name !== debouncedName || role !== debouncedRole || company !== debouncedCompany;

  // Commit debounced values to context
  useEffect(() => {
    dispatch({
      type: 'UPDATE_SPEAKER',
      speaker: { ...speaker, name: debouncedName, role: debouncedRole, company: debouncedCompany },
    });
  }, [debouncedName, debouncedRole, debouncedCompany]); // eslint-disable-line react-hooks/exhaustive-deps

  // Immediate commit on blur or Enter
  const commitNow = useCallback(() => {
    dispatch({
      type: 'UPDATE_SPEAKER',
      speaker: { ...speaker, name, role, company },
    });
  }, [dispatch, speaker, name, role, company]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitNow();
      }
    },
    [commitNow]
  );

  // ── Audio sample playback ─────────────────────────────────────────────────
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const handlePlaySample = useCallback(() => {
    if (!audioBase64 || !mimeType) return;

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setIsPlaying(false);
      return;
    }

    const duration = getSamplePlaybackDuration(
      speaker.id,
      state.edited.transcript
    );

    const src = `data:${mimeType};base64,${audioBase64}`;
    const audio = new Audio(src);
    audio.currentTime = speaker.timestamp;

    const stopAt = speaker.timestamp + duration;
    audio.ontimeupdate = () => {
      if (audio.currentTime >= stopAt) {
        audio.pause();
        audioRef.current = null;
        setIsPlaying(false);
      }
    };
    audio.onended = () => {
      audioRef.current = null;
      setIsPlaying(false);
    };

    audioRef.current = audio;
    setIsPlaying(true);
    audio.play().catch(() => {
      audioRef.current = null;
      setIsPlaying(false);
    });
  }, [audioBase64, mimeType, speaker.id, speaker.timestamp, state.edited.transcript]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      {/* Header row */}
      <div className="flex items-center gap-3 mb-3">
        <div
          className="w-4 h-4 rounded-full flex-shrink-0"
          style={{ backgroundColor: speaker.color }}
        />
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          {speaker.label}
        </span>
        {hasPending && (
          <span className="text-xs text-amber-500 ml-auto">● saving…</span>
        )}
      </div>

      {/* Fields */}
      <div className="space-y-2">
        <input
          type="text"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitNow}
          onKeyDown={handleKeyDown}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
        <input
          type="text"
          placeholder="Role / Title"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          onBlur={commitNow}
          onKeyDown={handleKeyDown}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
        <input
          type="text"
          placeholder="Company"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          onBlur={commitNow}
          onKeyDown={handleKeyDown}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
      </div>

      {/* Audio sample */}
      {audioBase64 && (
        <button
          onClick={handlePlaySample}
          className="mt-3 flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-800"
        >
          {isPlaying ? '⏹ Stop sample' : '▶ Play sample'}
        </button>
      )}
    </div>
  );
});
