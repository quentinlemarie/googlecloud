import React, { useCallback, useMemo, useState } from 'react';
import { useTranscription } from '../context/useTranscription';
import { SpeakerEditor } from './SpeakerEditor';
import { generateOutputs } from '../lib/pipeline';
import { BRAND_RED } from '../lib/constants';
import { ConfirmDialog } from './ConfirmDialog';
import type { Speaker } from '../types';
import logoSrc from '../assets/Logo.svg';

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
  const outputLanguage = state.ui.outputLanguage;
  const analysisMode = state.ui.analysisMode;
  const [confirmTarget, setConfirmTarget] = useState<'restart' | null>(null);

  // Group speakers by company; named companies first, empty last (alphabetically sorted)
  const speakersByCompany = useMemo(() => {
    const groups = new Map<string, Speaker[]>();
    for (const speaker of speakers) {
      const key = speaker.company || '';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(speaker);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => {
      if (!a && b) return 1;
      if (a && !b) return -1;
      return a.localeCompare(b);
    });
  }, [speakers]);

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
      outputLanguage,
      (progress, message) => dispatch({ type: 'SET_PROGRESS', progress, message }),
      (message) => {
        dispatch({ type: 'SET_ERROR', message });
        dispatch({ type: 'SET_STAGE', stage: 'REVIEW' });
      },
      analysisMode
    );

    if (result) {
      dispatch({
        type: 'SET_OUTPUTS',
        executiveSummary: result.executiveSummary,
        structuredSummary: result.structuredSummary,
        behaviouralSummary: result.behaviouralSummary,
        remarks: result.remarks,
        chatCacheId: result.chatCacheId,
        _chatInlineContext: result._chatInlineContext,
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
    <div className="min-h-screen bg-gray-50 p-6 relative">
      {/* Logo – top-right, discreet */}
      <img src={logoSrc} alt="Smart Transcription logo" className="absolute top-4 right-4 h-8 opacity-70" />
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
          <div className="mb-8">
            {speakersByCompany.map(([company, companySpeakers]) => (
              <div key={company || '__no_company__'} className="mb-6">
                {company && (
                  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                    {company}
                  </h3>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {companySpeakers.map((speaker) => (
                    <SpeakerEditor
                      key={speaker.id}
                      speaker={speaker}
                      audioBase64={audioBase64}
                      mimeType={mimeType}
                    />
                  ))}
                </div>
              </div>
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
