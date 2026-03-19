import React, { useState } from 'react';
import { useTranscription } from '../context/useTranscription';
import { BRAND_RED } from '../lib/constants';
import { ConfirmDialog } from './ConfirmDialog';
import logoSrc from '../assets/Logo.svg';

type ConfirmTarget = 'cancel' | 'restart';

export const LoadingPage = React.memo(function LoadingPage() {
  const { state, dispatch } = useTranscription();
  const { progress, message, stage } = state.pipeline;
  const isSummarizing = stage === 'SUMMARIZING';
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget | null>(null);

  const handleConfirm = () => {
    if (confirmTarget === 'cancel' && isSummarizing) {
      // Go back to review so the user can re-edit before re-generating
      dispatch({ type: 'SET_STAGE', stage: 'REVIEW' });
    } else {
      // For LOADING stage, or Restart from any stage: full reset
      dispatch({ type: 'RESET' });
    }
    setConfirmTarget(null);
  };

  const cancelDialogProps = isSummarizing
    ? {
        message: 'Stop generating and go back to the review page?',
        confirmLabel: 'Yes, go back',
        cancelLabel: 'Keep waiting',
      }
    : {
        message: 'Cancel the current processing and go back to the selection menu?',
        confirmLabel: 'Yes, cancel',
        cancelLabel: 'Keep waiting',
      };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 relative">
      {/* Logo – top-right, discreet */}
      <img src={logoSrc} alt="Smart Transcription logo" className="absolute top-4 right-4 h-8 opacity-70" />
      <div className="w-full max-w-md text-center">
        <h2 className="text-2xl font-bold mb-2" style={{ color: BRAND_RED }}>
          Processing…
        </h2>
        <p className="text-gray-500 mb-8">{message || 'Please wait'}</p>

        {/* Progress bar */}
        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
          <div
            className="h-3 rounded-full transition-all duration-500"
            style={{ width: `${progress}%`, backgroundColor: BRAND_RED }}
          />
        </div>
        <p className="text-sm text-gray-400 mt-2">{progress}%</p>

        {/* Spinner */}
        <div className="mt-8 flex justify-center">
          <svg
            className="animate-spin h-10 w-10 text-gray-400"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
            />
          </svg>
        </div>

        {/* Cancel / Restart buttons */}
        <div className="mt-8 flex items-center justify-center gap-6">
          <button
            onClick={() => setConfirmTarget('cancel')}
            className="text-sm text-gray-400 hover:text-gray-600 underline underline-offset-2 transition-colors"
          >
            {isSummarizing ? '← Back to review' : 'Cancel'}
          </button>
          <button
            onClick={() => setConfirmTarget('restart')}
            className="text-sm text-gray-400 hover:text-gray-600 underline underline-offset-2 transition-colors"
          >
            ↺ Restart from scratch
          </button>
        </div>
      </div>

      {confirmTarget === 'cancel' && (
        <ConfirmDialog
          {...cancelDialogProps}
          onConfirm={handleConfirm}
          onCancel={() => setConfirmTarget(null)}
        />
      )}

      {confirmTarget === 'restart' && (
        <ConfirmDialog
          message="Restart from scratch? All current progress will be lost."
          confirmLabel="Yes, restart"
          cancelLabel="Keep waiting"
          onConfirm={handleConfirm}
          onCancel={() => setConfirmTarget(null)}
        />
      )}
    </div>
  );
});
