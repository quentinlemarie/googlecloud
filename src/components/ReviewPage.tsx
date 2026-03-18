import React, { useCallback, useState } from 'react';
import { useTranscription } from '../context/useTranscription';
import { SpeakerEditor } from './SpeakerEditor';
import { generateOutputs } from '../lib/pipeline';
import { BRAND_RED } from '../lib/constants';
import { ConfirmDialog } from './ConfirmDialog';

interface ReviewPageProps {
  audioBase64?: string;
  mimeType?: string;
}

export const ReviewPage = React.memo(function ReviewPage({
  audioBase64,
  mimeType,
}: ReviewPageProps) {
  const { state, dispatch } = useTranscription();
  const speakers = state.edited.speakers;
  const [confirmTarget, setConfirmTarget] = useState<'restart' | null>(null);

  const handleConfirm = useCallback(async () => {
    dispatch({
      type: 'SET_PIPELINE',
      stage: 'SUMMARIZING',
      status: 'running',
      progress: 0,
      message: 'Generating summary…',
    });

    const result = await generateOutputs(
      state,
      (progress, message) => dispatch({ type: 'SET_PROGRESS', progress, message }),
      (message) => {
        dispatch({ type: 'SET_ERROR', message });
        dispatch({ type: 'SET_STAGE', stage: 'REVIEW' });
      }
    );

    if (result) {
      dispatch({
        type: 'SET_OUTPUTS',
        executiveSummary: result.executiveSummary,
        structuredSummary: result.structuredSummary,
        behaviouralSummary: result.behaviouralSummary,
        remarks: result.remarks,
      });
      dispatch({
        type: 'SET_PIPELINE',
        stage: 'DONE',
        status: 'idle',
        progress: 100,
        message: '',
      });
    }
  }, [state, dispatch]);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6 text-center">
          <h2 className="text-2xl font-bold" style={{ color: BRAND_RED }}>
            Review Speakers
          </h2>
          <p className="text-gray-500 text-sm mt-1">
            Fill in speaker details and correct any errors before generating the summary.
          </p>
        </div>

        {speakers.length === 0 ? (
          <p className="text-center text-gray-400">No speakers detected.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
            {speakers.map((speaker) => (
              <SpeakerEditor
                key={speaker.id}
                speaker={speaker}
                audioBase64={audioBase64}
                mimeType={mimeType}
              />
            ))}
          </div>
        )}

        <div className="flex flex-col items-center gap-3">
          <button
            onClick={handleConfirm}
            className="px-8 py-3 rounded-xl font-semibold text-white shadow-md hover:opacity-90 transition-opacity"
            style={{ backgroundColor: BRAND_RED }}
          >
            Confirm & Generate Summary
          </button>
          <button
            onClick={() => setConfirmTarget('restart')}
            className="text-sm text-gray-400 hover:text-gray-600 underline underline-offset-2 transition-colors mt-1"
          >
            ↺ Restart from scratch
          </button>
        </div>
      </div>

      {confirmTarget === 'restart' && (
        <ConfirmDialog
          message="Restart from scratch? All current progress will be lost."
          confirmLabel="Yes, restart"
          cancelLabel="Keep reviewing"
          onConfirm={() => dispatch({ type: 'RESET' })}
          onCancel={() => setConfirmTarget(null)}
        />
      )}
    </div>
  );
});
