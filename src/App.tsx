import { useTranscription } from './context/useTranscription';
import { TranscriptionProvider } from './context/TranscriptionContext';
import { InputPage } from './components/InputPage';
import { LoadingPage } from './components/LoadingPage';
import { ReviewPage } from './components/ReviewPage';
import { OutputPage } from './components/OutputPage';

// ─────────────────────────────────────────────────────────────────────────────
// Inner app – consumes context
// ─────────────────────────────────────────────────────────────────────────────
function AppInner() {
  const { state, dispatch } = useTranscription();
  const { stage } = state.pipeline;
  const errorMessage = state.ui.errorMessage;

  return (
    <div className="min-h-screen font-sans antialiased">
      {/* Global error banner */}
      {errorMessage && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-red-50 border border-red-300 rounded-xl px-5 py-3 shadow-lg flex items-center gap-3 max-w-lg">
          <span className="text-red-600 text-sm flex-1">{errorMessage}</span>
          <button
            onClick={() => dispatch({ type: 'SET_ERROR', message: null })}
            className="text-red-400 hover:text-red-600 font-bold"
          >
            ×
          </button>
        </div>
      )}

      {/* Stage routing */}
      {stage === 'INIT' && <InputPage />}
      {stage === 'LOADING' && <LoadingPage />}
      {stage === 'REVIEW' && (
        <ReviewPage
          audioBase64={state.rawData.audioBase64}
          mimeType={state.rawData.mimeType}
        />
      )}
      {stage === 'SUMMARIZING' && <LoadingPage />}
      {stage === 'DONE' && <OutputPage />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Root component wraps everything in the Context Provider
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <TranscriptionProvider>
      <AppInner />
    </TranscriptionProvider>
  );
}
