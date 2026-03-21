import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranscription } from '../context/useTranscription';
import { processAudioFile, processMultipleAudioFiles, processFromDrive } from '../lib/pipeline';
import { BRAND_RED } from '../lib/constants';
import type { OutputLanguage, Speaker, TranscriptEntry, AnalysisMode } from '../types';
import { requestAccessToken } from '../lib/auth';
import { uploadRecordingBlob } from '../lib/storage';
import { ConfirmDialog } from './ConfirmDialog';
import { RecordingsLibrary } from './RecordingsLibrary';
import { useAudioLevel, SILENCE_THRESHOLD } from '../hooks/useAudioLevel';
import { AudioLevelIndicator } from './AudioLevelIndicator';
import logoSrc from '../assets/Logo.svg';

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

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const InputPage = React.memo(function InputPage() {
  const { state, dispatch } = useTranscription();
  const outputLanguage = state.ui.outputLanguage;
  const analysisMode = state.ui.analysisMode;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const [confirmTarget, setConfirmTarget] = useState<'cancel' | 'restart' | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
  const [showRecordings, setShowRecordings] = useState(false);
  const [collectedFiles, setCollectedFiles] = useState<File[]>([]);
  const addFileInputRef = useRef<HTMLInputElement>(null);
  // Files sourced from Cloud Storage (RecordingsLibrary) don't need re-uploading.
  const gcsFilesRef = useRef<WeakSet<File>>(new WeakSet());

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

  const handleLanguageChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    dispatch({ type: 'SET_OUTPUT_LANGUAGE', language: e.target.value as OutputLanguage });
  }, [dispatch]);

  const handleAnalysisModeChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    dispatch({ type: 'SET_ANALYSIS_MODE', mode: e.target.value as AnalysisMode });
  }, [dispatch]);

  // ── Google Drive ──────────────────────────────────────────────────────────
  const handleDrive = useCallback(async () => {
    startLoading('Connecting to Google Drive…');
    try {
      const result = await processFromDrive(onProgress, onError, outputLanguage, analysisMode);
      if (result) {
        finishLoading(result.speakers, result.transcript, result.audioBase64, result.mimeType);
      } else {
        // User cancelled the picker or auth – return to the start screen.
        dispatch({ type: 'SET_STAGE', stage: 'INIT' });
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : 'An unexpected error occurred');
    }
  }, [startLoading, onProgress, onError, finishLoading, dispatch, outputLanguage, analysisMode]);

  // ── Local Upload ──────────────────────────────────────────────────────────
  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setCollectedFiles((prev) => [...prev, file]);
      // Reset the input so the same file can be re-added if needed
      e.target.value = '';
    },
    []
  );

  const handleAddMoreFiles = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setCollectedFiles((prev) => [...prev, file]);
      e.target.value = '';
    },
    []
  );

  const handleRemoveFile = useCallback((index: number) => {
    setCollectedFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleClearFiles = useCallback(() => {
    setCollectedFiles([]);
  }, []);

  /** Process all collected files as a single collated recording. */
  const handleProcessCollected = useCallback(
    async () => {
      if (collectedFiles.length === 0) return;

      // Determine which files need to be uploaded (exclude those already in GCS).
      const filesToUpload = collectedFiles.filter((f) => !gcsFilesRef.current.has(f));

      startLoading(filesToUpload.length > 0 ? 'Uploading files…' : 'Processing…');

      // Upload each new file to Cloud Storage – non-fatal if it fails
      for (let i = 0; i < filesToUpload.length; i++) {
        const file = filesToUpload[i];
        onProgress(Math.round((i / filesToUpload.length) * 20), `Saving file ${i + 1}/${filesToUpload.length} to Cloud Storage…`);
        try {
          const accessToken = await requestAccessToken();
          await uploadRecordingBlob(file, file.name, accessToken);
        } catch (uploadErr) {
          console.warn('File GCS upload failed (continuing with transcription):', uploadErr);
        }
      }
      onProgress(25, filesToUpload.length > 0 ? 'Files saved. Transcribing…' : 'Transcribing…');

      const result = await processMultipleAudioFiles(collectedFiles, onProgress, onError, outputLanguage, analysisMode);
      if (result) {
        setCollectedFiles([]);
        finishLoading(result.speakers, result.transcript, result.audioBase64, result.mimeType);
      }
    },
    [collectedFiles, startLoading, onProgress, onError, finishLoading, outputLanguage, analysisMode]
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
    (e: React.DragEvent) => {
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

      setCollectedFiles((prev) => [...prev, file]);
    },
    [onError]
  );

  // ── Recordings Library ────────────────────────────────────────────────────
  const handleUseRecording = useCallback(
    (file: File) => {
      setShowRecordings(false);
      // Mark as already saved so handleProcessCollected skips re-uploading it.
      gcsFilesRef.current.add(file);
      setCollectedFiles((prev) => [...prev, file]);
    },
    []
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
        const result = await processAudioFile(file, onProgress, onError, outputLanguage, analysisMode);
        if (result) finishLoading(result.speakers, result.transcript, result.audioBase64, result.mimeType);
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch {
      onError('Microphone access denied. Please allow microphone access and try again.');
    }
  }, [startLoading, onProgress, onError, finishLoading, outputLanguage, analysisMode]);

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

  // ── Share-target: pick up files shared from other apps (e.g. Voice Memos on iOS) ──
  useEffect(() => {
    (async () => {
      try {
        const cache = await caches.open('share-target-audio');
        const keys = await cache.keys();
        if (keys.length === 0) return;

        for (const request of keys) {
          const response = await cache.match(request);
          if (!response) continue;
          const blob = await response.blob();
          const url = new URL(request.url);
          const rawName = url.searchParams.get('name');
          const filename = rawName ? decodeURIComponent(rawName) : 'shared-audio.m4a';
          const mime = blob.type || 'audio/mp4';
          const file = new File([blob], filename, { type: mime });
          setCollectedFiles((prev) => [...prev, file]);
          await cache.delete(request);
        }
      } catch (err) {
        console.warn('Share target: failed to retrieve shared file', err);
      }
    })();
  }, []);

  return (
    <div
      className="min-h-screen bg-gray-50 flex flex-col p-6 relative"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Logo – top-right, discreet */}
      <img src={logoSrc} alt="Smart Transcription logo" className="self-end h-8 opacity-70 shrink-0" />

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

      <div className="flex-1 flex flex-col items-center justify-center w-full">
      <div className="w-full max-w-lg">
        {/* Logo / Title */}
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold" style={{ color: BRAND_RED }}>
            Smart Transcription
          </h1>
          <p className="text-gray-500 mt-2">AI-powered meeting transcription & analysis</p>
        </div>

        {/* Output language selector */}
        <div className="mb-6 flex items-center justify-center gap-6 flex-wrap">
          <div className="flex items-center gap-2">
            <label htmlFor="output-language" className="text-sm font-medium text-gray-600">
              Output language:
            </label>
            <select
              id="output-language"
              value={outputLanguage}
              onChange={handleLanguageChange}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            >
              <option value="en">English</option>
              <option value="fr">Français</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="analysis-mode" className="text-sm font-medium text-gray-600">
              Analysis:
            </label>
            <select
              id="analysis-mode"
              value={analysisMode}
              onChange={handleAnalysisModeChange}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            >
              <option value="fast">⚡ Fast</option>
              <option value="deep">🔬 Deep</option>
            </select>
          </div>
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
            accept="audio/*,video/*,.m4a"
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

          {/* My Recordings */}
          <button
            onClick={() => setShowRecordings(true)}
            className="w-full flex items-center gap-4 bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow"
          >
            <span className="text-3xl">📼</span>
            <div className="text-left">
              <div className="font-semibold text-gray-800">My Recordings</div>
              <div className="text-sm text-gray-500">Browse, download or reuse a past recording</div>
            </div>
          </button>
        </div>

        {/* ── Collected files queue ─────────────────────────────────── */}
        {collectedFiles.length > 0 && (
          <div className="mt-6 bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-800">
                {collectedFiles.length === 1 ? '1 file selected' : `${collectedFiles.length} files selected`}
              </h3>
              <button
                onClick={handleClearFiles}
                className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2"
              >
                Clear all
              </button>
            </div>

            <ul className="space-y-2 mb-4">
              {collectedFiles.map((file, index) => (
                <li key={`${file.name}-${index}`} className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2">
                  <span className="text-lg">🎵</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-700 truncate">{file.name}</div>
                    <div className="text-xs text-gray-400">{formatFileSize(file.size)}</div>
                  </div>
                  {index > 0 && (
                    <span className="text-xs text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-full shrink-0">
                      Part {index + 1}
                    </span>
                  )}
                  <button
                    onClick={() => handleRemoveFile(index)}
                    className="text-gray-300 hover:text-red-500 transition-colors shrink-0"
                    title="Remove file"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>

            <div className="flex gap-3">
              <button
                onClick={() => addFileInputRef.current?.click()}
                className="flex-1 flex items-center justify-center gap-2 border border-dashed border-gray-300 rounded-lg px-4 py-2.5 text-sm text-gray-600 hover:border-gray-400 hover:text-gray-800 transition-colors"
              >
                <span>＋</span> Add
              </button>
              <input
                ref={addFileInputRef}
                type="file"
                accept="audio/*,video/*,.m4a"
                className="hidden"
                onChange={handleAddMoreFiles}
              />
              <button
                onClick={handleProcessCollected}
                className="flex-1 flex items-center justify-center gap-2 text-white rounded-lg px-4 py-2.5 text-sm font-semibold shadow-sm hover:opacity-90 transition-opacity"
                style={{ backgroundColor: BRAND_RED }}
              >
                ✓ Ready
              </button>
            </div>
          </div>
        )}
      </div>
      </div>

      {showRecordings && (
        <RecordingsLibrary
          onClose={() => setShowRecordings(false)}
          onUse={handleUseRecording}
        />
      )}

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
