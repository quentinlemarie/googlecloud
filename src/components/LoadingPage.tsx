import React, { useState } from 'react';
import { useTranscription } from '../context/useTranscription';
import { BRAND_RED } from '../lib/constants';
import { ConfirmDialog } from './ConfirmDialog';

export const LoadingPage = React.memo(function LoadingPage() {
  const { state, dispatch } = useTranscription();
  const { progress, message } = state.pipeline;
  const [showConfirm, setShowConfirm] = useState(false);

  const handleCancel = () => setShowConfirm(true);
  const handleConfirmCancel = () => {
    setShowConfirm(false);
    dispatch({ type: 'RESET' });
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
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

        {/* Cancel button */}
        <button
          onClick={handleCancel}
          className="mt-8 text-sm text-gray-400 hover:text-gray-600 underline underline-offset-2 transition-colors"
        >
          Cancel
        </button>
      </div>

      {showConfirm && (
        <ConfirmDialog
          message="Cancel the current processing and start over?"
          confirmLabel="Yes, cancel"
          cancelLabel="Keep waiting"
          onConfirm={handleConfirmCancel}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </div>
  );
});
