import React from 'react';
import { SILENCE_THRESHOLD } from '../hooks/useAudioLevel';

interface AudioLevelIndicatorProps {
  /** Normalized audio level, 0 – 1 */
  level: number;
}

/**
 * A circle that grows and shrinks to reflect the current audio level.
 *
 * - Silent (level ≈ 0): small grey circle (visual cue that no audio is detected).
 * - Active (level > 0):  circle scales up and turns red, proportional to volume.
 */
export const AudioLevelIndicator = React.memo<AudioLevelIndicatorProps>(
  function AudioLevelIndicator({ level }) {
    // Scale: 1× at silence → up to 1.8× at max volume
    const scale = 1 + level * 0.8;
    const isActive = level > SILENCE_THRESHOLD;

    return (
      <div className="flex items-center justify-center" aria-hidden="true">
        <div
          className="rounded-full transition-colors duration-150"
          style={{
            width: 48,
            height: 48,
            backgroundColor: isActive
              ? `rgba(239, 68, 68, ${0.35 + level * 0.65})`   /* red-500 with dynamic opacity */
              : 'rgba(156, 163, 175, 0.4)',                    /* grey-400 at 40 % */
            transform: `scale(${scale})`,
            transition: 'transform 0.1s ease-out, background-color 0.15s ease-out',
          }}
        />
      </div>
    );
  },
);
