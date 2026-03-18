import React from 'react';
import type { Speaker, TranscriptEntry } from '../types';
import { formatTime } from '../utils/timeUtils';

interface SpeakerGroupProps {
  speaker: Speaker;
  entries: TranscriptEntry[];
}

/**
 * Displays all transcript entries for a single speaker grouped together.
 */
export const SpeakerGroup = React.memo(function SpeakerGroup({
  speaker,
  entries,
}: SpeakerGroupProps) {
  const displayName = speaker.name || speaker.label;
  const subtitle = [speaker.role, speaker.company].filter(Boolean).join(' · ');

  return (
    <div className="mb-6">
      {/* Speaker header */}
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-3 h-3 rounded-full flex-shrink-0"
          style={{ backgroundColor: speaker.color }}
        />
        <span className="font-semibold text-sm text-gray-800">{displayName}</span>
        {subtitle && (
          <span className="text-xs text-gray-400">— {subtitle}</span>
        )}
      </div>

      {/* Entries */}
      <div className="space-y-1 pl-5 border-l-2" style={{ borderColor: speaker.color }}>
        {entries.map((entry) => (
          <div key={entry.id} className="flex gap-2">
            <span className="text-xs text-gray-400 w-10 flex-shrink-0 mt-0.5">
              {formatTime(entry.startTime)}
            </span>
            <p className="text-sm text-gray-700 flex-1">{entry.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
});
