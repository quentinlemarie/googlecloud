import React, { useCallback, useEffect, useRef } from 'react';
import { useTranscription } from '../context/useTranscription';

/**
 * Modal for reassigning a transcript entry to a different speaker.
 */
export const SpeakerModal = React.memo(function SpeakerModal() {
  const { state, dispatch } = useTranscription();
  const { speakerModalOpen, speakerModalEntryId } = state.ui;
  const { speakers } = state.edited;
  const overlayRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    dispatch({ type: 'CLOSE_SPEAKER_MODAL' });
  }, [dispatch]);

  const handleSelect = useCallback(
    (speakerId: string) => {
      if (!speakerModalEntryId) return;
      dispatch({ type: 'REASSIGN_SPEAKER', entryId: speakerModalEntryId, newSpeakerId: speakerId });
    },
    [dispatch, speakerModalEntryId]
  );

  // Close on Escape key
  useEffect(() => {
    if (!speakerModalOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [speakerModalOpen, close]);

  if (!speakerModalOpen) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={(e) => {
        if (e.target === overlayRef.current) close();
      }}
    >
      <div className="bg-white rounded-2xl shadow-xl p-6 w-80 max-h-96 overflow-y-auto">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Reassign Speaker</h3>
        <div className="space-y-2">
          {speakers.map((s) => (
            <button
              key={s.id}
              onClick={() => handleSelect(s.id)}
              className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 text-left transition-colors"
            >
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: s.color }}
              />
              <span className="text-sm font-medium text-gray-700">{s.name || s.label}</span>
            </button>
          ))}
        </div>
        <button
          onClick={close}
          className="mt-4 w-full text-center text-sm text-gray-400 hover:text-gray-600"
        >
          Cancel
        </button>
      </div>
    </div>
  );
});
