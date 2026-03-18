import React, { useState } from 'react';
import { useTranscription } from '../context/useTranscription';
import { ExportMenu } from './ExportMenu';
import { ConfirmDialog } from './ConfirmDialog';
import { BRAND_RED } from '../lib/constants';

interface HeaderProps {
  transcriptText: string;
}

export const Header = React.memo(function Header({ transcriptText }: HeaderProps) {
  const { dispatch } = useTranscription();
  const [showConfirm, setShowConfirm] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          {/* Brand */}
          <h1 className="text-xl font-bold" style={{ color: BRAND_RED }}>
            Smart Transcription
          </h1>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowConfirm(true)}
              className="text-sm text-gray-500 hover:text-gray-700 underline"
            >
              Start over
            </button>
            <ExportMenu transcriptText={transcriptText} />
          </div>
        </div>
      </header>

      {showConfirm && (
        <ConfirmDialog
          message="Discard the current output and go back to the selection menu?"
          confirmLabel="Yes, start over"
          cancelLabel="Stay here"
          onConfirm={() => dispatch({ type: 'RESET' })}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  );
});
