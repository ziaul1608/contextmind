import React, { useRef, useEffect } from 'react';
import { Send, Square } from 'lucide-react';

interface ChatComposerProps {
  input: string;
  onChange: (val: string) => void;
  onSend: () => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled?: boolean;
}

const MAX_CHAR_COUNT = 8000;

export function ChatComposer({
  input,
  onChange,
  onSend,
  onStop,
  isStreaming,
  disabled = false,
}: ChatComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea height
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [input]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isStreaming && input.trim() && !disabled) {
        onSend();
      }
    }
  };

  const charCount = input.length;
  const isOverLimit = charCount > MAX_CHAR_COUNT;
  const canSend = !isStreaming && input.trim().length > 0 && !isOverLimit && !disabled;

  return (
    <div className="border-t border-gray-800/80 bg-gray-950/80 backdrop-blur-sm p-4">
      <div className="max-w-3xl mx-auto space-y-2">
        <div className="relative flex items-end gap-2 bg-gray-900 border border-gray-800 rounded-2xl p-2.5 focus-within:border-indigo-500/80 focus-within:ring-1 focus-within:ring-indigo-500/40 transition-all shadow-lg">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask ContextMind anything... (Shift+Enter for new line)"
            rows={1}
            disabled={disabled}
            className="flex-1 max-h-56 bg-transparent text-sm text-gray-100 placeholder-gray-500 focus:outline-none resize-none px-2 py-1 leading-relaxed"
          />

          <div className="flex items-center gap-1.5 flex-shrink-0 mb-0.5">
            {isStreaming ? (
              <button
                type="button"
                onClick={onStop}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-medium transition-all shadow-sm active:scale-95"
                title="Stop generating"
              >
                <Square className="w-3 h-3 fill-current" />
                <span>Stop</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onSend}
                disabled={!canSend}
                className="p-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-800 text-white disabled:text-gray-500 rounded-xl transition-all shadow-sm disabled:cursor-not-allowed active:scale-95"
                title="Send message"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Character Count & Shortcut Tips */}
        <div className="flex items-center justify-between px-2 text-[11px] text-gray-500 font-mono">
          <span>Enter to send · Shift+Enter for newline</span>
          <span className={isOverLimit ? 'text-red-400 font-semibold' : ''}>
            {charCount.toLocaleString()} / {MAX_CHAR_COUNT.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}
