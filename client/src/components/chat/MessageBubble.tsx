import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Check, User, Bot } from 'lucide-react';
import type { MessageRole, MessageSource } from '@contextmind/shared';
import { SourceCards } from './SourceCards';

interface MessageBubbleProps {
  role: MessageRole;
  content: string;
  createdAt?: string;
  isStreaming?: boolean;
  sources?: MessageSource[];
}

export function MessageBubble({
  role,
  content,
  createdAt,
  isStreaming = false,
  sources,
}: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const isUser = role === 'USER';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy message:', err);
    }
  };

  const formattedTime = createdAt
    ? new Date(createdAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  // Transform inline citations like [1] into markdown links [#source-1] so they are interactive
  const contentWithCitationLinks = !isUser
    ? content.replace(/\[(\d+)\](?!\()/g, '[$1](#source-$1)')
    : content;

  return (
    <div
      className={`group flex gap-3 px-4 py-3 md:px-6 transition-colors ${
        isUser ? 'bg-transparent' : 'bg-gray-900/40 border-y border-gray-800/40'
      }`}
    >
      {/* Role Avatar */}
      <div className="flex-shrink-0 mt-1">
        {isUser ? (
          <div className="w-7 h-7 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center text-gray-300">
            <User className="w-4 h-4" />
          </div>
        ) : (
          <div className="w-7 h-7 rounded-lg bg-indigo-600/90 border border-indigo-500/30 flex items-center justify-center text-white shadow-sm shadow-indigo-500/20">
            <Bot className="w-4 h-4" />
          </div>
        )}
      </div>

      {/* Message Body */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center justify-between text-xs text-gray-400">
          <span className="font-semibold text-gray-300">
            {isUser ? 'You' : 'ContextMind'}
          </span>
          <div className="flex items-center gap-2">
            {formattedTime && (
              <span className="text-[10px] text-gray-500 font-mono">
                {formattedTime}
              </span>
            )}
            {!isUser && !isStreaming && content && (
              <button
                onClick={handleCopy}
                className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-gray-200 rounded transition-all"
                title="Copy response"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-green-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            )}
          </div>
        </div>

        {/* Content with Markdown Rendering */}
        <div className="text-sm text-gray-200 leading-relaxed break-words prose prose-invert max-w-none prose-pre:p-0 prose-pre:bg-transparent">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              // Interactive citation link styling
              a({ href, children, ...props }: any) {
                if (href?.startsWith('#source-')) {
                  return (
                    <a
                      href={href}
                      className="inline-flex items-center justify-center px-1.5 py-0.5 mx-0.5 text-[10px] font-bold font-mono rounded bg-indigo-950 text-indigo-300 border border-indigo-700/60 hover:bg-indigo-900 transition-colors no-underline cursor-pointer align-baseline"
                      title={`Jump to source ${String(children)}`}
                    >
                      {children}
                    </a>
                  );
                }
                return (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2 transition-colors"
                    {...props}
                  >
                    {children}
                  </a>
                );
              },
              // Code highlighting
              code({ inline, className, children, ...props }: any) {
                const match = /language-(\w+)/.exec(className || '');
                const codeString = String(children).replace(/\n$/, '');

                if (!inline && match) {
                  return (
                    <div className="relative my-3 rounded-lg overflow-hidden border border-gray-800 bg-gray-950">
                      <div className="flex items-center justify-between px-3 py-1 bg-gray-900 border-b border-gray-800 text-[11px] text-gray-400 font-mono">
                        <span>{match[1]}</span>
                        <button
                          onClick={() => void navigator.clipboard.writeText(codeString)}
                          className="hover:text-white transition-colors"
                        >
                          Copy
                        </button>
                      </div>
                      <SyntaxHighlighter
                        style={vscDarkPlus as any}
                        language={match[1]}
                        PreTag="div"
                        customStyle={{
                          margin: 0,
                          padding: '12px',
                          background: 'transparent',
                          fontSize: '12px',
                        }}
                        {...props}
                      >
                        {codeString}
                      </SyntaxHighlighter>
                    </div>
                  );
                }

                return (
                  <code
                    className="bg-gray-800/80 text-indigo-300 px-1.5 py-0.5 rounded text-xs font-mono"
                    {...props}
                  >
                    {children}
                  </code>
                );
              },
            }}
          >
            {contentWithCitationLinks}
          </ReactMarkdown>

          {isStreaming && (
            <span className="inline-block w-2 h-4 ml-1 bg-indigo-400 animate-pulse align-middle" />
          )}
        </div>

        {/* Source Citation Cards */}
        {sources && sources.length > 0 && <SourceCards sources={sources} />}
      </div>
    </div>
  );
}
