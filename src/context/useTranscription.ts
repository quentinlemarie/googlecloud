import { useContext } from 'react';
import { TranscriptionContext } from './TranscriptionContext';

/**
 * Custom hook to consume the TranscriptionContext.
 * Must be used within a <TranscriptionProvider>.
 */
export function useTranscription() {
  const ctx = useContext(TranscriptionContext);
  if (!ctx) {
    throw new Error('useTranscription must be used within a TranscriptionProvider');
  }
  return ctx;
}
