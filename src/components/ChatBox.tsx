import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useTranscription } from '../context/useTranscription';
import { chatWithAnalysis } from '../lib/gemini';
import { GEMINI_MODELS, BRAND_RED } from '../lib/constants';
import type { ChatMessage } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// ChatBox
// ─────────────────────────────────────────────────────────────────────────────
export function ChatBox() {
  const { state } = useTranscription();
  const { chatCacheId, _chatInlineContext } = state.outputs;
  const analysisMode = state.ui.analysisMode;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(true);

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = { role: 'user', text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const model = GEMINI_MODELS[analysisMode];
      const reply = await chatWithAnalysis(
        text,
        messages,
        model,
        chatCacheId ?? null,
        _chatInlineContext ?? null
      );
      setMessages((prev) => [...prev, { role: 'model', text: reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'model', text: 'Sorry, something went wrong. Please try again.' },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, analysisMode, chatCacheId, _chatInlineContext]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void handleSend();
      }
    },
    [handleSend]
  );

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
      {/* Header / toggle */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 py-2 text-left group"
      >
        <span className="text-lg font-bold group-hover:opacity-80 flex items-center gap-2" style={{ color: BRAND_RED }}>
          <span>💬</span> Ask about this meeting
        </span>
        <span className="text-gray-400 text-sm flex-shrink-0">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="mt-2">
          <p className="text-xs text-gray-400 mb-3">Chat with Gemini about the analysis.</p>

          {/* Message history */}
          <div className="min-h-[60px] max-h-72 overflow-y-auto space-y-2 mb-3 px-1">
            {messages.length === 0 && !loading && (
              <p className="text-center text-gray-400 italic text-sm py-4">
                Ask a question about the meeting analysis…
              </p>
            )}
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-xl px-4 py-2 text-sm whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'text-white'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                  style={msg.role === 'user' ? { backgroundColor: BRAND_RED } : undefined}
                >
                  {msg.text}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 rounded-xl px-4 py-2 text-sm text-gray-500 italic">
                  Thinking…
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input row */}
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your question…"
              disabled={loading}
              className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50"
              style={{ borderColor: BRAND_RED }}
            />
            <button
              onClick={() => void handleSend()}
              disabled={!input.trim() || loading}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40 transition-opacity"
              style={{ backgroundColor: BRAND_RED }}
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
