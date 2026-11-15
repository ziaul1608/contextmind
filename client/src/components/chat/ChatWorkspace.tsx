import { useRef, useEffect } from 'react';
import { MessageBubble } from './MessageBubble';
import { WelcomeScreen } from './WelcomeScreen';
import { SidebarTrigger } from '../layout/Sidebar';
import type { Message, MessageRole, MessageSource } from '@contextmind/shared';
import { Sparkles, AlertCircle, Search, Cpu, Brain } from 'lucide-react';

interface ChatWorkspaceProps {
  activeTitle?: string;
  messages: Message[];
  streamingText: string;
  streamingSources: MessageSource[];
  retrievedMemories?: Array<{ id: string; content: string; category: string }>;
  isStreaming: boolean;
  statusPhase: 'thinking' | 'searching' | 'synthesizing' | null;
  statusQuery: string | null;
  error: string | null;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  onSelectPrompt: (prompt: string) => void;
  onOpenMemories?: () => void;
  providers?: {
    ollama?: boolean;
    ollamaModel?: string;
    modelInstalled?: boolean;
    tavily?: boolean;
  };
}

export function ChatWorkspace({
  activeTitle,
  messages,
  streamingText,
  streamingSources,
  retrievedMemories,
  isStreaming,
  statusPhase,
  statusQuery,
  error,
  isSidebarOpen,
  onToggleSidebar,
  onSelectPrompt,
  onOpenMemories,
  providers,
}: ChatWorkspaceProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new message / token arrival / source arrival
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingText, statusPhase, streamingSources]);

  const hasMessages = messages.length > 0 || isStreaming;
  const isOllamaConnected = Boolean(providers?.ollama && providers?.modelInstalled);
  const isOllamaRunningWithoutModel = Boolean(providers?.ollama && !providers?.modelInstalled);

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-gray-950 overflow-hidden relative">
      {/* Workspace Header */}
      <header className="h-14 border-b border-gray-800/80 px-4 flex items-center justify-between bg-gray-950/70 backdrop-blur-md z-10 flex-shrink-0">
        <div className="flex items-center gap-3 overflow-hidden">
          {!isSidebarOpen && <SidebarTrigger onToggle={onToggleSidebar} />}
          <div className="truncate">
            <h2 className="text-sm font-semibold text-gray-200 truncate">
              {activeTitle || 'New Conversation'}
            </h2>
            <div className="flex items-center gap-2 text-[10px] font-mono mt-0.5">
              <span
                className="flex items-center gap-1.5"
                title={
                  isOllamaConnected
                    ? `Local model ${providers?.ollamaModel || 'qwen2.5:3b'} is running via Ollama`
                    : isOllamaRunningWithoutModel
                      ? `Model ${providers?.ollamaModel} is not installed`
                      : 'Ollama daemon is not reachable at 127.0.0.1:11434'
                }
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isOllamaConnected
                      ? 'bg-emerald-400'
                      : isOllamaRunningWithoutModel
                        ? 'bg-amber-400'
                        : 'bg-red-400'
                  }`}
                />
                <span
                  className={
                    isOllamaConnected
                      ? 'text-gray-300'
                      : isOllamaRunningWithoutModel
                        ? 'text-amber-400/90'
                        : 'text-red-400/90'
                  }
                >
                  {isOllamaConnected
                    ? `Local AI (Ollama · ${providers?.ollamaModel || 'qwen2.5:3b'}): Connected`
                    : isOllamaRunningWithoutModel
                      ? `Ollama: Model ${providers?.ollamaModel} not installed`
                      : 'Local AI (Ollama): Offline'}
                </span>
              </span>
              <span className="text-gray-700">·</span>
              <span className="flex items-center gap-1.5">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    providers?.tavily ? 'bg-emerald-400' : 'bg-gray-500'
                  }`}
                />
                <span className={providers?.tavily ? 'text-gray-400' : 'text-gray-500'}>
                  {providers?.tavily ? 'Web Search: Active (Tavily)' : 'Web Search: Disabled'}
                </span>
              </span>
            </div>
          </div>
        </div>

        {/* Live Status indicator */}
        <div className="flex items-center gap-2">
          {/* Recalled Memory Context Badge */}
          {retrievedMemories && retrievedMemories.length > 0 && (
            <button
              onClick={onOpenMemories}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-medium hover:bg-emerald-500/20 transition-all cursor-pointer shadow-sm"
              title={retrievedMemories.map((m) => `• [${m.category}] ${m.content}`).join('\n')}
            >
              <Brain className="w-3.5 h-3.5 text-emerald-400" />
              <span>
                Recalled {retrievedMemories.length} {retrievedMemories.length === 1 ? 'memory' : 'memories'}
              </span>
            </button>
          )}

          {statusPhase === 'searching' && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-medium animate-pulse">
              <Search className="w-3.5 h-3.5" />
              <span>
                Searching the web{statusQuery ? `: "${statusQuery.slice(0, 30)}${statusQuery.length > 30 ? '...' : ''}"` : '...'}
              </span>
            </div>
          )}

          {statusPhase === 'synthesizing' && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-medium animate-pulse">
              <Cpu className="w-3.5 h-3.5" />
              <span>Analyzing sources...</span>
            </div>
          )}

          {statusPhase === 'thinking' && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-medium animate-pulse">
              <Sparkles className="w-3 h-3" />
              <span>Thinking...</span>
            </div>
          )}
        </div>
      </header>

      {/* Message List Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {!hasMessages ? (
          <div className="flex flex-col h-full">
            {error && (
              <div className="max-w-2xl mx-auto mt-4 px-4 w-full">
                <div className="p-3.5 bg-red-950/60 border border-red-800/80 rounded-xl text-xs text-red-200 flex items-start gap-3 shadow-md">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-400 mt-0.5" />
                  <div className="flex-1 space-y-1">
                    <p className="font-semibold text-red-300">Action Required</p>
                    <p className="leading-relaxed">{error}</p>
                  </div>
                </div>
              </div>
            )}
            <div className="flex-1">
              <WelcomeScreen onSelectPrompt={onSelectPrompt} />
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto py-4 space-y-1">
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                role={msg.role}
                content={msg.content}
                createdAt={msg.createdAt}
                sources={msg.sources}
              />
            ))}

            {/* In-flight streaming response bubble */}
            {isStreaming && (
              <MessageBubble
                role={'ASSISTANT' as MessageRole}
                content={streamingText || (statusPhase ? '' : ' ')}
                isStreaming={true}
                sources={streamingSources}
              />
            )}

            {/* Error Banner */}
            {error && (
              <div className="mx-4 my-3 p-3.5 bg-red-950/60 border border-red-800/80 rounded-xl text-xs text-red-200 flex items-start gap-3 shadow-md">
                <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-400 mt-0.5" />
                <div className="flex-1 space-y-1">
                  <p className="font-semibold text-red-300">Action Required</p>
                  <p className="leading-relaxed">{error}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
