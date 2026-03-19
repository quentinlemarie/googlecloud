import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranscription } from '../context/useTranscription';
import { processAudioFile, processFromDrive } from '../lib/pipeline';
import { BRAND_RED } from '../lib/constants';
import type { Speaker, TranscriptEntry } from '../types';
import { requestAccessToken } from '../lib/auth';
import { uploadRecordingBlob } from '../lib/storage';
import { ConfirmDialog } from './ConfirmDialog';
import { useAudioLevel, SILENCE_THRESHOLD } from '../hooks/useAudioLevel';
import { AudioLevelIndicator } from './AudioLevelIndicator';

// ─────────────────────────────────────────────────────────────────────────────
// Pick the best audio encoding supported by this browser.
// Preference order:
//   1. audio/mp4 (AAC-LC) → saves as .m4a  – Chrome, Safari, Edge
//   2. audio/mpeg          → saves as .mp3  – rarely supported natively
//   3. audio/webm;codecs=opus → .webm     – Firefox, Chrome fallback
//   4. audio/webm                          – last resort
// ─────────────────────────────────────────────────────────────────────────────
function chooseMimeType(): { mimeType: string; ext: string } {
  const candidates: Array<{ mimeType: string; ext: string }> = [
    { mimeType: 'audio/mp4;codecs=mp4a.40.2', ext: 'm4a' },
    { mimeType: 'audio/mp4',                  ext: 'm4a' },
    { mimeType: 'audio/mpeg',                 ext: 'mp3' },
    { mimeType: 'audio/webm;codecs=opus',     ext: 'webm' },
    { mimeType: 'audio/webm',                 ext: 'webm' },
  ];
  return (
    candidates.find((c) => MediaRecorder.isTypeSupported(c.mimeType)) ??
    { mimeType: '', ext: 'webm' }
  );
}

export const InputPage = React.memo(function InputPage() {
  const { dispatch } = useTranscription();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const [confirmTarget, setConfirmTarget] = useState<'cancel' | 'restart' | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);

  // Live audio-level (0 – 1) for the visual indicator
  const audioLevel = useAudioLevel(micStream);

  /** Stop all tracks on the current microphone stream to release the hardware. */
  const releaseMicrophone = useCallback(() => {
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    setMicStream(null);
  }, []);

  const handleStopAndReset = useCallback(() => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
    releaseMicrophone();
    dispatch({ type: 'RESET' });
    setConfirmTarget(null);
  }, [dispatch, releaseMicrophone]);

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
    (speakers: Speaker[], transcript: TranscriptEntry[], audioBase64?: string, mimeType?: string) => {
      dispatch({ type: 'SET_RAW_DATA', speakers, transcript, audioBase64, mimeType });
      dispatch({ type: 'SET_PIPELINE', stage: 'REVIEW', status: 'idle', progress: 100, message: '' });
    },
    [dispatch]
  );

  // ── Google Drive ──────────────────────────────────────────────────────────
  const handleDrive = useCallback(async () => {
    startLoading('Connecting to Google Drive…');
    try {
      const result = await processFromDrive(onProgress, onError);
      if (result) {
        finishLoading(result.speakers, result.transcript, result.audioBase64, result.mimeType);
      } else {
        // User cancelled the picker or auth – return to the start screen.
        dispatch({ type: 'SET_STAGE', stage: 'INIT' });
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : 'An unexpected error occurred');
    }
  }, [startLoading, onProgress, onError, finishLoading, dispatch]);

  // ── Shared file processing (used by file input + drag-and-drop) ─────────
  const processUploadedFile = useCallback(
    async (file: File) => {
      startLoading('Uploading file…');
      onProgress(5, `Saving file to Cloud Storage (mtp-storage/Recordings/)…`);

      // Upload the file to mtp-storage/Recordings/ – non-fatal if it fails
      try {
        const accessToken = await requestAccessToken();
        await uploadRecordingBlob(file, file.name, accessToken);
        onProgress(25, 'File saved. Transcribing…');
      } catch (uploadErr) {
        console.warn('File GCS upload failed (continuing with transcription):', uploadErr);
        onProgress(25, 'Transcribing…');
      }

      const result = await processAudioFile(file, onProgress, onError);
      if (result) finishLoading(result.speakers, result.transcript, result.audioBase64, result.mimeType);
    },
    [startLoading, onProgress, onError, finishLoading]
  );

  // ── Local Upload ──────────────────────────────────────────────────────────
  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      await processUploadedFile(file);
    },
    [processUploadedFile]
  );

  // ── Drag & Drop ───────────────────────────────────────────────────────────
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current = 0;
      setIsDragging(false);

      const file = e.dataTransfer.files?.[0];
      if (!file) return;

      // Only accept audio or video files (check MIME type first, fall back to extension)
      const mediaExtensions = /\.(mp3|wav|m4a|webm|ogg|flac|aac|wma|opus|mp4|mov|avi|mkv|m4v)$/i;
      if (!file.type.startsWith('audio/') && !file.type.startsWith('video/') && !mediaExtensions.test(file.name)) {
        onError('Please drop an audio or video file (MP3, WAV, M4A, MP4, MOV…)');
        return;
      }

      await processUploadedFile(file);
    },
    [processUploadedFile, onError]
  );

  // ── Microphone ────────────────────────────────────────────────────────────
  const handleMicStart = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      micStreamRef.current = stream;
      setMicStream(stream);

      const { mimeType, ext } = chooseMimeType();
      const recorderOptions = mimeType ? { mimeType } : {};
      const recorder = new MediaRecorder(stream, recorderOptions);
      const effectiveMime = recorder.mimeType || 'audio/webm';

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        // Release microphone immediately
        stream.getTracks().forEach((t) => t.stop());
        setMicStream(null);

        const blob = new Blob(chunksRef.current, { type: effectiveMime });
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `recording-${timestamp}.${ext}`;

        startLoading('Uploading recording…');
        onProgress(5, `Saving recording to Cloud Storage (mtp-storage/Recordings/)…`);

        // Upload raw recording to mtp-storage/Recordings/ – non-fatal if it fails
        try {
          const accessToken = await requestAccessToken();
          await uploadRecordingBlob(blob, filename, accessToken);
          onProgress(25, 'Recording saved. Transcribing…');
        } catch (uploadErr) {
          console.warn('Recording GCS upload failed (continuing with transcription):', uploadErr);
          onProgress(25, 'Transcribing…');
        }

        const file = new File([blob], filename, { type: effectiveMime });
        const result = await processAudioFile(file, onProgress, onError);
        if (result) finishLoading(result.speakers, result.transcript, result.audioBase64, result.mimeType);
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
    releaseMicrophone();
  }, [releaseMicrophone]);

  // Release microphone if the component unmounts while still recording
  useEffect(() => {
    return () => {
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div
      className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 relative"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drop-zone overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-red-50/80 backdrop-blur-sm border-4 border-dashed border-red-400 rounded-2xl m-4 pointer-events-none">
          <div className="text-center">
            <span className="text-6xl block mb-4">🎵</span>
            <p className="text-xl font-semibold text-red-600">Drop your audio or video file here</p>
            <p className="text-sm text-red-400 mt-1">MP3, WAV, M4A, MP4, MOV, WebM…</p>
          </div>
        </div>
      )}

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
              <div className="text-sm text-gray-500">Pick an audio or video file from your Drive</div>
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
              <div className="text-sm text-gray-500">MP3, WAV, M4A, MP4, MOV…</div>
            </div>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,video/*"
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
            <>
              <button
                onClick={handleMicStop}
                className="w-full flex items-center gap-4 bg-red-50 border-2 border-red-400 rounded-xl p-5 shadow-sm"
              >
                <AudioLevelIndicator level={audioLevel} />
                <div className="text-left">
                  <div className="font-semibold text-red-600">Recording… click to stop</div>
                  <div className="text-sm text-red-400">
                    {audioLevel > SILENCE_THRESHOLD ? 'Audio is being captured' : 'No audio detected — check your mic'}
                  </div>
                </div>
              </button>

              {/* Cancel / Restart while recording */}
              <div className="flex items-center justify-center gap-6 pt-2">
                <button
                  onClick={() => setConfirmTarget('cancel')}
                  className="text-sm text-gray-400 hover:text-gray-600 underline underline-offset-2 transition-colors"
                >
                  Cancel recording
                </button>
                <button
                  onClick={() => setConfirmTarget('restart')}
                  className="text-sm text-gray-400 hover:text-gray-600 underline underline-offset-2 transition-colors"
                >
                  ↺ Restart from scratch
                </button>
              </div>
            </>
          )}

          {/* Drag-and-drop hint */}
          <p className="text-center text-xs text-gray-400 pt-2">
            or drag &amp; drop an audio or video file anywhere on this page
          </p>
        </div>
      </div>

      {confirmTarget === 'cancel' && (
        <ConfirmDialog
          message="Stop the current recording and go back to the selection menu?"
          confirmLabel="Yes, cancel"
          cancelLabel="Keep recording"
          onConfirm={handleStopAndReset}
          onCancel={() => setConfirmTarget(null)}
        />
      )}

      {confirmTarget === 'restart' && (
        <ConfirmDialog
          message="Stop the recording and restart from scratch? The current audio will be lost."
          confirmLabel="Yes, restart"
          cancelLabel="Keep recording"
          onConfirm={handleStopAndReset}
          onCancel={() => setConfirmTarget(null)}
        />
      )}
    </div>
  );
});
