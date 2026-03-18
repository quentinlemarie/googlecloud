import { useEffect, useRef } from 'react';

/**
 * Tracks the previous value of any variable across renders.
 * Returns `undefined` on the first render.
 */
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref.current;
}
