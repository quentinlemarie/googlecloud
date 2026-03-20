import React, { createContext, useReducer, useEffect, type ReactNode } from 'react';
import type {
  TranscriptionState,
  PipelineStage,
  PipelineStatus,
  Speaker,
  TranscriptEntry,
  SpeakerRemark,
  OutputLanguage,
  AnalysisMode,
} from '../types';
import { LS_STATE_KEY, APP_BUILD_TIME } from '../lib/constants';

// ─────────────────────────────────────────────────────────────────────────────
// Action types
// ─────────────────────────────────────────────────────────────────────────────
export type TranscriptionAction =
  | { type: 'SET_STAGE'; stage: PipelineStage }
  | { type: 'SET_PIPELINE'; stage: PipelineStage; status: PipelineStatus; progress: number; message: string }
  | { type: 'SET_PROGRESS'; progress: number; message: string }
  | { type: 'SET_ERROR'; message: string | null }
  | { type: 'SET_RAW_DATA'; speakers: Speaker[]; transcript: TranscriptEntry[]; audioFileUrl?: string; audioBase64?: string; mimeType?: string }
  | { type: 'SET_EDITED_SPEAKERS'; speakers: Speaker[] }
  | { type: 'UPDATE_SPEAKER'; speaker: Speaker }
  | { type: 'SET_EDITED_TRANSCRIPT'; transcript: TranscriptEntry[] }
  | { type: 'UPDATE_TRANSCRIPT_ENTRY'; entry: TranscriptEntry }
  | { type: 'SET_SUMMARY'; summary: string }
  | { type: 'SET_REMARKS'; remarks: SpeakerRemark[] }
  | { type: 'SET_OUTPUTS'; executiveSummary: string; structuredSummary: string; behaviouralSummary: string; remarks: SpeakerRemark[]; chatCacheId: string | null; _chatInlineContext?: { prompt: string; rawResponse: string } }
  | { type: 'SET_CLOUD_STORAGE_URL'; url: string }
  | { type: 'SET_CHAT_CACHE_ID'; chatCacheId: string | null }
  | { type: 'OPEN_SPEAKER_MODAL'; entryId: string }
  | { type: 'CLOSE_SPEAKER_MODAL' }
  | { type: 'SET_EXPORT_MENU_OPEN'; open: boolean }
  | { type: 'SET_TRANSCRIPT_EDIT_MODE'; enabled: boolean }
  | { type: 'SET_OUTPUT_LANGUAGE'; language: OutputLanguage }
  | { type: 'SET_ANALYSIS_MODE'; mode: AnalysisMode }
  | { type: 'REASSIGN_SPEAKER'; entryId: string; newSpeakerId: string }
  | { type: 'REASSIGN_SPEAKER_ALL'; oldSpeakerId: string; newSpeakerId: string }
  | { type: 'RESET' };

// ─────────────────────────────────────────────────────────────────────────────
// Initial state
// ─────────────────────────────────────────────────────────────────────────────
const initialState: TranscriptionState = {
  pipeline: {
    stage: 'INIT',
    status: 'idle',
    progress: 0,
    message: '',
  },
  rawData: {
    audioFileUrl: null,
    transcript: [],
    speakers: [],
  },
  edited: {
    speakers: [],
    transcript: [],
  },
  outputs: {
    executiveSummary: '',
    structuredSummary: '',
    behaviouralSummary: '',
    remarks: [],
    cloudStorageUrl: null,
    chatCacheId: null,
  },
  ui: {
    speakerModalOpen: false,
    speakerModalEntryId: null,
    exportMenuOpen: false,
    transcriptEditMode: false,
    errorMessage: null,
    outputLanguage: 'en',
    analysisMode: 'deep',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Reducer
// ─────────────────────────────────────────────────────────────────────────────
function reducer(state: TranscriptionState, action: TranscriptionAction): TranscriptionState {
  switch (action.type) {
    case 'SET_STAGE':
      return { ...state, pipeline: { ...state.pipeline, stage: action.stage } };

    case 'SET_PIPELINE':
      return {
        ...state,
        pipeline: {
          stage: action.stage,
          status: action.status,
          progress: action.progress,
          message: action.message,
        },
      };

    case 'SET_PROGRESS':
      return {
        ...state,
        pipeline: { ...state.pipeline, progress: action.progress, message: action.message },
      };

    case 'SET_ERROR':
      return {
        ...state,
        pipeline: { ...state.pipeline, status: action.message ? 'error' : 'idle' },
        ui: { ...state.ui, errorMessage: action.message },
      };

    case 'SET_RAW_DATA':
      return {
        ...state,
        rawData: {
          audioFileUrl: action.audioFileUrl ?? state.rawData.audioFileUrl,
          speakers: action.speakers,
          transcript: action.transcript,
          audioBase64: action.audioBase64,
          mimeType: action.mimeType,
        },
        edited: {
          speakers: action.speakers,
          transcript: action.transcript,
        },
      };

    case 'SET_EDITED_SPEAKERS':
      return { ...state, edited: { ...state.edited, speakers: action.speakers } };

    case 'UPDATE_SPEAKER':
      return {
        ...state,
        edited: {
          ...state.edited,
          speakers: state.edited.speakers.map((s) =>
            s.id === action.speaker.id ? action.speaker : s
          ),
        },
      };

    case 'SET_EDITED_TRANSCRIPT':
      return { ...state, edited: { ...state.edited, transcript: action.transcript } };

    case 'UPDATE_TRANSCRIPT_ENTRY':
      return {
        ...state,
        edited: {
          ...state.edited,
          transcript: state.edited.transcript.map((e) =>
            e.id === action.entry.id ? action.entry : e
          ),
        },
      };

    case 'SET_SUMMARY':
      return { ...state, outputs: { ...state.outputs, executiveSummary: action.summary } };

    case 'SET_REMARKS':
      return { ...state, outputs: { ...state.outputs, remarks: action.remarks } };

    case 'SET_OUTPUTS':
      return {
        ...state,
        outputs: {
          ...state.outputs,
          executiveSummary: action.executiveSummary,
          structuredSummary: action.structuredSummary,
          behaviouralSummary: action.behaviouralSummary,
          remarks: action.remarks,
          chatCacheId: action.chatCacheId,
          _chatInlineContext: action._chatInlineContext,
        },
      };

    case 'SET_CLOUD_STORAGE_URL':
      return { ...state, outputs: { ...state.outputs, cloudStorageUrl: action.url } };

    case 'SET_CHAT_CACHE_ID':
      return { ...state, outputs: { ...state.outputs, chatCacheId: action.chatCacheId } };

    case 'OPEN_SPEAKER_MODAL':
      return {
        ...state,
        ui: { ...state.ui, speakerModalOpen: true, speakerModalEntryId: action.entryId },
      };

    case 'CLOSE_SPEAKER_MODAL':
      return {
        ...state,
        ui: { ...state.ui, speakerModalOpen: false, speakerModalEntryId: null },
      };

    case 'SET_EXPORT_MENU_OPEN':
      return { ...state, ui: { ...state.ui, exportMenuOpen: action.open } };

    case 'SET_TRANSCRIPT_EDIT_MODE':
      return { ...state, ui: { ...state.ui, transcriptEditMode: action.enabled } };

    case 'SET_OUTPUT_LANGUAGE':
      return { ...state, ui: { ...state.ui, outputLanguage: action.language } };

    case 'SET_ANALYSIS_MODE':
      return { ...state, ui: { ...state.ui, analysisMode: action.mode } };

    case 'REASSIGN_SPEAKER': {
      const updatedTranscript = state.edited.transcript.map((e) =>
        e.id === action.entryId ? { ...e, speakerId: action.newSpeakerId } : e
      );
      return {
        ...state,
        edited: { ...state.edited, transcript: updatedTranscript },
        ui: { ...state.ui, speakerModalOpen: false, speakerModalEntryId: null },
      };
    }

    case 'REASSIGN_SPEAKER_ALL': {
      const updatedTranscript = state.edited.transcript.map((e) =>
        e.speakerId === action.oldSpeakerId ? { ...e, speakerId: action.newSpeakerId } : e
      );
      return {
        ...state,
        edited: { ...state.edited, transcript: updatedTranscript },
        ui: { ...state.ui, speakerModalOpen: false, speakerModalEntryId: null },
      };
    }

    case 'RESET':
      return initialState;

    default:
      return state;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Load / save localStorage helpers
// ─────────────────────────────────────────────────────────────────────────────
function loadFromStorage(): TranscriptionState {
  try {
    const raw = localStorage.getItem(LS_STATE_KEY);
    if (!raw) return initialState;
    const parsed = JSON.parse(raw) as Partial<TranscriptionState> & { buildTime?: number };
    // If the stored build time doesn't match the current build, discard the
    // cached state so users always start fresh after a new deployment.
    if (parsed.buildTime !== APP_BUILD_TIME) {
      return initialState;
    }
    const state = { ...initialState, ...parsed };
    // Transient processing stages cannot be resumed after a page reload.
    // Reset them to INIT so the user is never permanently stuck on the
    // loading screen with no way to cancel.
    if (state.pipeline.stage === 'LOADING' || state.pipeline.stage === 'SUMMARIZING') {
      return { ...state, pipeline: initialState.pipeline };
    }
    return state;
  } catch {
    return initialState;
  }
}

function saveToStorage(state: TranscriptionState): void {
  try {
    // Don't persist transient UI state or large audio/cache data
    const { ui: _ui, rawData, outputs, ...rest } = state;
    const { audioBase64: _audioBase64, mimeType: _mimeType, ...persistableRawData } = rawData;
    const { _chatInlineContext: _cacheCtx, ...persistableOutputs } = outputs;
    localStorage.setItem(
      LS_STATE_KEY,
      JSON.stringify({ ...rest, rawData: persistableRawData, outputs: persistableOutputs, buildTime: APP_BUILD_TIME })
    );
  } catch {
    // Storage may be full
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────────────────────
interface TranscriptionContextValue {
  state: TranscriptionState;
  dispatch: React.Dispatch<TranscriptionAction>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const TranscriptionContext = createContext<TranscriptionContextValue | null>(null);

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────
interface TranscriptionProviderProps {
  children: ReactNode;
}

export function TranscriptionProvider({ children }: TranscriptionProviderProps) {
  const [state, dispatch] = useReducer(reducer, undefined, loadFromStorage);

  useEffect(() => {
    saveToStorage(state);
  }, [state]);

  return (
    <TranscriptionContext.Provider value={{ state, dispatch }}>
      {children}
    </TranscriptionContext.Provider>
  );
}
