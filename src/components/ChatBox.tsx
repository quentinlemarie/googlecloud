import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useTranscription } from '../context/useTranscription';
import { chatWithAnalysis } from '../lib/gemini';
import { BRAND_RED } from '../lib/constants';
import type { ChatMessage } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// ChatBox – follow-up Q&A panel backed by the Gemini context cache so the
// model continues from the same analysis without resending all tokens.
// ─────────────────────────────────────────────────────────────────────────────

export const ChatBox = React.memo(function ChatBox() {
  const { state } = useTranscription();
  const { executiveSummary, structuredSummary, behaviouralSummary, remarks, chatCacheId } = state.outputs;
  const { speakers, transcript } = state.edited;
  const outputLanguage = state.ui.outputLanguage;

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Focus input when chat is opened
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const toggleOpen = useCallback(() => setOpen((v) => !v), []);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    setInput('');
    setError(null);

    const userMsg: ChatMessage = { role: 'user', text: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      // Prefer the cached context; fall back to inline context if unavailable
      const reply = await chatWithAnalysis(
        messages,
        trimmed,
        chatCacheId,
        chatCacheId ? undefined : {
          transcript,
          speakers,
          executiveSummary,
          structuredSummary,
          behaviouralSummary,
          remarks,
          outputLanguage,
        },
      );
      const modelMsg: ChatMessage = { role: 'model', text: reply };
      setMessages((prev) => [...prev, modelMsg]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  }, [
    input, loading, messages, chatCacheId, transcript, speakers,
    executiveSummary, structuredSummary, behaviouralSummary, remarks, outputLanguage,
  ]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      {/* Header / toggle */}
      <button
        onClick={toggleOpen}
        className="w-full flex items-center justify-between gap-2 p-5 text-left group"
      >
        <span className="text-lg font-bold group-hover:opacity-80" style={{ color: BRAND_RED }}>
          💬 Ask about this meeting
        </span>
        <span className="text-gray-400 text-sm flex-shrink-0">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-3">
          {/* Subtitle */}
          <p className="text-xs text-gray-400">
            {chatCacheId
              ? 'Chat with Gemini — using the same analysis context (cached, no re-analysis).'
              : 'Chat with Gemini about the analysis.'}
          </p>

          {/* Messages */}
          <div className="max-h-80 overflow-y-auto space-y-3 rounded-lg bg-gray-50 p-3" role="log" aria-live="polite">
            {messages.length === 0 && !loading && (
              <p className="text-sm text-gray-400 italic text-center py-4">
                Ask a question about the meeting analysis…
              </p>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-red-50 text-gray-800 border border-red-100'
                      : 'bg-white text-gray-700 border border-gray-200'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-400 italic">
                  Thinking…
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Error */}
          {error && (
            <p className="text-xs text-red-500">{error}</p>
          )}

          {/* Input area */}
          <div className="flex gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your question…"
              aria-label="Chat message input"
              rows={1}
              className="flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400"
              disabled={loading}
            />
            <button
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className="flex-shrink-0 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              style={{ backgroundColor: BRAND_RED }}
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
});
