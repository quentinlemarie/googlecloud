import React, { useCallback, useRef, useState } from 'react';
import { useTranscription } from '../context/useTranscription';
import { processAudioFile, processFromDrive } from '../lib/pipeline';
import { BRAND_RED } from '../lib/constants';
import type { Speaker, TranscriptEntry } from '../types';

export const InputPage = React.memo(function InputPage() {
  const { dispatch } = useTranscription();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  const startLoading = useCallback(
    (message: string) => {
      dispatch({ type: 'SET_PIPELINE', stage: 'LOADING', status: 'running', progress: 0, message });
    },
    [dispatch]
  );

  const onProgress = useCallback(
    (progress: number, message: string) => {
      dispatch({ type: 'SET_PROGRESS', progress, message });
    },
    [dispatch]
  );

  const onError = useCallback(
    (message: string) => {
      dispatch({ type: 'SET_ERROR', message });
      dispatch({ type: 'SET_STAGE', stage: 'INIT' });
    },
    [dispatch]
  );

  const finishLoading = useCallback(
    (speakers: Speaker[], transcript: TranscriptEntry[]) => {
      dispatch({ type: 'SET_RAW_DATA', speakers, transcript });
      dispatch({ type: 'SET_PIPELINE', stage: 'REVIEW', status: 'idle', progress: 100, message: '' });
    },
    [dispatch]
  );

  // ── Google Drive ──────────────────────────────────────────────────────────
  const handleDrive = useCallback(async () => {
    startLoading('Connecting to Google Drive…');
    const result = await processFromDrive(onProgress, onError);
    if (result) finishLoading(result.speakers, result.transcript);
  }, [startLoading, onProgress, onError, finishLoading]);

  // ── Local Upload ──────────────────────────────────────────────────────────
  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      startLoading('Reading file…');
      const result = await processAudioFile(file, onProgress, onError);
      if (result) finishLoading(result.speakers, result.transcript);
    },
    [startLoading, onProgress, onError, finishLoading]
  );

  // ── Microphone ────────────────────────────────────────────────────────────
  const handleMicStart = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const file = new File([blob], 'recording.webm', { type: 'audio/webm' });
        startLoading('Processing recording…');
        const result = await processAudioFile(file, onProgress, onError);
        if (result) finishLoading(result.speakers, result.transcript);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch {
      onError('Microphone access denied. Please allow microphone access and try again.');
    }
  }, [startLoading, onProgress, onError, finishLoading]);

  const handleMicStop = useCallback(() => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-lg">
        {/* Logo / Title */}
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold" style={{ color: BRAND_RED }}>
            Smart Transcription
          </h1>
          <p className="text-gray-500 mt-2">AI-powered meeting transcription & analysis</p>
        </div>

        <div className="space-y-4">
          {/* Google Drive */}
          <button
            onClick={handleDrive}
            className="w-full flex items-center gap-4 bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow"
          >
            <span className="text-3xl">🗂️</span>
            <div className="text-left">
              <div className="font-semibold text-gray-800">Google Drive</div>
              <div className="text-sm text-gray-500">Pick an audio file from your Drive</div>
            </div>
          </button>

          {/* File Upload */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center gap-4 bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow"
          >
            <span className="text-3xl">📁</span>
            <div className="text-left">
              <div className="font-semibold text-gray-800">Upload File</div>
              <div className="text-sm text-gray-500">MP3, WAV, M4A, WebM…</div>
            </div>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={handleFileChange}
          />

          {/* Microphone */}
          {!isRecording ? (
            <button
              onClick={handleMicStart}
              className="w-full flex items-center gap-4 bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow"
            >
              <span className="text-3xl">🎙️</span>
              <div className="text-left">
                <div className="font-semibold text-gray-800">Record</div>
                <div className="text-sm text-gray-500">Record audio directly in the browser</div>
              </div>
            </button>
          ) : (
            <button
              onClick={handleMicStop}
              className="w-full flex items-center gap-4 bg-red-50 border-2 border-red-400 rounded-xl p-5 shadow-sm animate-pulse"
            >
              <span className="text-3xl">⏹️</span>
              <div className="text-left">
                <div className="font-semibold text-red-600">Recording… click to stop</div>
                <div className="text-sm text-red-400">Audio is being captured</div>
              </div>
            </button>
          )}
        </div>
      </div>
    </div>
  );
});
