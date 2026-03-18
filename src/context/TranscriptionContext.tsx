import React, { createContext, useReducer, useEffect, type ReactNode } from 'react';
import type {
  TranscriptionState,
  PipelineStage,
  PipelineStatus,
  Speaker,
  TranscriptEntry,
  SpeakerRemark,
} from '../types';
import { LS_STATE_KEY } from '../lib/constants';

// ─────────────────────────────────────────────────────────────────────────────
// Action types
// ─────────────────────────────────────────────────────────────────────────────
export type TranscriptionAction =
  | { type: 'SET_STAGE'; stage: PipelineStage }
  | { type: 'SET_PIPELINE'; stage: PipelineStage; status: PipelineStatus; progress: number; message: string }
  | { type: 'SET_PROGRESS'; progress: number; message: string }
  | { type: 'SET_ERROR'; message: string | null }
  | { type: 'SET_RAW_DATA'; speakers: Speaker[]; transcript: TranscriptEntry[]; audioFileUrl?: string }
  | { type: 'SET_EDITED_SPEAKERS'; speakers: Speaker[] }
  | { type: 'UPDATE_SPEAKER'; speaker: Speaker }
  | { type: 'SET_EDITED_TRANSCRIPT'; transcript: TranscriptEntry[] }
  | { type: 'UPDATE_TRANSCRIPT_ENTRY'; entry: TranscriptEntry }
  | { type: 'SET_SUMMARY'; summary: string }
  | { type: 'SET_REMARKS'; remarks: SpeakerRemark[] }
  | { type: 'SET_OUTPUTS'; summary: string; remarks: SpeakerRemark[] }
  | { type: 'SET_CLOUD_STORAGE_URL'; url: string }
  | { type: 'SET_NOTEBOOK_LM_URL'; url: string }
  | { type: 'OPEN_SPEAKER_MODAL'; entryId: string }
  | { type: 'CLOSE_SPEAKER_MODAL' }
  | { type: 'SET_EXPORT_MENU_OPEN'; open: boolean }
  | { type: 'SET_TRANSCRIPT_EDIT_MODE'; enabled: boolean }
  | { type: 'REASSIGN_SPEAKER'; entryId: string; newSpeakerId: string }
  | { type: 'RESET' };

// ─────────────────────────────────────────────────────────────────────────────
// Initial state
// ─────────────────────────────────────────────────────────────────────────────
export const initialState: TranscriptionState = {
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
    summary: '',
    remarks: [],
    notebookLmUrl: null,
    cloudStorageUrl: null,
  },
  ui: {
    speakerModalOpen: false,
    speakerModalEntryId: null,
    exportMenuOpen: false,
    transcriptEditMode: false,
    errorMessage: null,
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
      return { ...state, outputs: { ...state.outputs, summary: action.summary } };

    case 'SET_REMARKS':
      return { ...state, outputs: { ...state.outputs, remarks: action.remarks } };

    case 'SET_OUTPUTS':
      return {
        ...state,
        outputs: { ...state.outputs, summary: action.summary, remarks: action.remarks },
      };

    case 'SET_CLOUD_STORAGE_URL':
      return { ...state, outputs: { ...state.outputs, cloudStorageUrl: action.url } };

    case 'SET_NOTEBOOK_LM_URL':
      return { ...state, outputs: { ...state.outputs, notebookLmUrl: action.url } };

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
    const parsed = JSON.parse(raw) as Partial<TranscriptionState>;
    return { ...initialState, ...parsed };
  } catch {
    return initialState;
  }
}

function saveToStorage(state: TranscriptionState): void {
  try {
    // Don't persist transient UI state
    const { ui: _ui, ...rest } = state;
    localStorage.setItem(LS_STATE_KEY, JSON.stringify(rest));
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
