import { useEffect, useRef, useState } from 'react';

/** Volume below this threshold is treated as silence. */
export const SILENCE_THRESHOLD = 0.02;

/**
 * Monitors the audio level of a MediaStream using the Web Audio API.
 * Returns a normalized volume level between 0 and 1.
 *
 * When stream is null the returned level is 0.
 */
export function useAudioLevel(stream: MediaStream | null): number {
  const [level, setLevel] = useState(0);
  const rafRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!stream) {
      setLevel(0);
      return;
    }

    const audioCtx = new AudioContext();
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.5;

    const source = audioCtx.createMediaStreamSource(stream);
    source.connect(analyser);

    ctxRef.current = audioCtx;
    analyserRef.current = analyser;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      analyser.getByteFrequencyData(dataArray);

      // Compute the RMS (root mean square) of the frequency data
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i] * dataArray[i];
      }
      const rms = Math.sqrt(sum / dataArray.length);

      // Normalize to 0-1.  We divide by 128 (not 255) so that
      // moderate speech already reaches ~0.6–0.8, giving a more
      // responsive visual feel for typical microphone input.
      const normalized = Math.min(rms / 128, 1);
      setLevel(normalized);

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      source.disconnect();
      analyser.disconnect();
      audioCtx.close();
      ctxRef.current = null;
      analyserRef.current = null;
    };
  }, [stream]);

  return level;
}
