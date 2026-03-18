import React, { useCallback } from 'react';
import { useTranscription } from '../context/useTranscription';
import type { TranscriptEntry } from '../types';
import { formatTime } from '../utils/timeUtils';

export const TranscriptViewer = React.memo(function TranscriptViewer() {
  const { state, dispatch } = useTranscription();
  const { transcript } = state.edited;
  const { speakers } = state.edited;
  const editMode = state.ui.transcriptEditMode;

  const speakerMap = Object.fromEntries(speakers.map((s) => [s.id, s]));

  const handleTextChange = useCallback(
    (entry: TranscriptEntry, text: string) => {
      dispatch({ type: 'UPDATE_TRANSCRIPT_ENTRY', entry: { ...entry, text } });
    },
    [dispatch]
  );

  const handleSpeakerClick = useCallback(
    (entryId: string) => {
      dispatch({ type: 'OPEN_SPEAKER_MODAL', entryId });
    },
    [dispatch]
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-semibold text-gray-700">Transcript</h3>
        <button
          onClick={() => dispatch({ type: 'SET_TRANSCRIPT_EDIT_MODE', enabled: !editMode })}
          className="text-sm text-indigo-600 hover:underline"
        >
          {editMode ? 'Done editing' : 'Edit'}
        </button>
      </div>

      {transcript.length === 0 ? (
        <p className="text-gray-400 text-sm">No transcript available.</p>
      ) : (
        transcript.map((entry) => {
          const speaker = speakerMap[entry.speakerId];
          const displayName = speaker?.name || speaker?.label || entry.speakerId;
          const color = speaker?.color ?? '#888';

          return (
            <div key={entry.id} className="flex gap-3">
              {/* Timestamp */}
              <span className="text-xs text-gray-400 w-10 flex-shrink-0 mt-1">
                {formatTime(entry.startTime)}
              </span>

              <div className="flex-1">
                {/* Speaker name – clickable to reassign */}
                <button
                  onClick={() => handleSpeakerClick(entry.id)}
                  className="text-xs font-semibold mb-1 hover:underline"
                  style={{ color }}
                >
                  {displayName}
                </button>

                {/* Text – editable in edit mode */}
                {editMode ? (
                  <textarea
                    className="w-full text-sm text-gray-700 border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
                    value={entry.text}
                    rows={Math.max(2, Math.ceil(entry.text.length / 80))}
                    onChange={(e) => handleTextChange(entry, e.target.value)}
                  />
                ) : (
                  <p className="text-sm text-gray-700">{entry.text}</p>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
});
