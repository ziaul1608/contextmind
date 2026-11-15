import { useState, useEffect, useCallback } from 'react';
import type { Memory, HistoricalSearchResult } from '@contextmind/shared';
import {
  Brain,
  Search,
  X,
  Trash2,
  Calendar,
  MessageSquare,
  Sparkles,
  ExternalLink,
  Shield,
  Layers,
} from 'lucide-react';
import { apiClient } from '../../api/client';

interface MemoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectConversation: (id: string) => void;
}

const CATEGORIES = ['All', 'project', 'tech_stack', 'preference', 'decision', 'fact'];

export function MemoryModal({ isOpen, onClose, onSelectConversation }: MemoryModalProps) {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [searchResults, setSearchResults] = useState<HistoricalSearchResult[] | null>(null);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchMemories = useCallback(async () => {
    setIsLoading(true);
    try {
      const categoryParam = selectedCategory !== 'All' ? `&category=${selectedCategory}` : '';
      const { data } = await apiClient.get<{ data: { items: Memory[] } }>(
        `/memories?limit=50${categoryParam}`,
      );
      setMemories(data.data.items || []);
      setSearchResults(null);
    } catch (err) {
      console.error('Failed to fetch memories:', err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedCategory]);

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults(null);
      void fetchMemories();
      return;
    }

    setIsLoading(true);
    try {
      const { data } = await apiClient.get<{ data: HistoricalSearchResult[] }>(
        `/memories/search?q=${encodeURIComponent(query)}&limit=15`,
      );
      setSearchResults(data.data || []);
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await apiClient.delete(`/memories/${id}`);
      setMemories((prev) => prev.filter((m) => m.id !== id));
      if (searchResults) {
        setSearchResults((prev) => (prev ? prev.filter((r) => r.id !== id) : null));
      }
    } catch (err) {
      console.error('Failed to delete memory:', err);
    } finally {
      setDeletingId(null);
    }
  };

  useEffect(() => {
    if (isOpen) {
      void fetchMemories();
    }
  }, [isOpen, fetchMemories]);

  if (!isOpen) return null;

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  const getCategoryColor = (cat: string) => {
    switch (cat.toLowerCase()) {
      case 'project':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
      case 'tech_stack':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
      case 'preference':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'decision':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'fact':
        return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30';
      default:
        return 'bg-gray-500/10 text-gray-400 border-gray-500/30';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-3xl max-h-[85vh] bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-sm">
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Memory Vault</h2>
              <p className="text-xs text-gray-400">
                Persistent facts, decisions, and preferences remembered across conversations
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search & Category Filter */}
        <div className="p-4 border-b border-gray-800/80 space-y-3 bg-gray-900/60">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => void handleSearch(e.target.value)}
              placeholder="Search historical memories, summaries, or past messages..."
              className="w-full pl-9 pr-4 py-2 bg-gray-950 border border-gray-800 rounded-xl text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          {/* Categories */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            {CATEGORIES.map((cat) => {
              const isActive = selectedCategory === cat && !searchResults;
              return (
                <button
                  key={cat}
                  onClick={() => {
                    setSelectedCategory(cat);
                    setSearchQuery('');
                    setSearchResults(null);
                  }}
                  className={`px-3 py-1 rounded-lg capitalize font-medium transition-all ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-gray-800/80 text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                  }`}
                >
                  {cat.replace('_', ' ')}
                </button>
              );
            })}
          </div>
        </div>

        {/* Memory Content List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {isLoading ? (
            <div className="py-12 text-center text-xs text-gray-500">
              Loading memories...
            </div>
          ) : searchResults ? (
            /* Search Results View */
            searchResults.length === 0 ? (
              <div className="py-12 text-center text-xs text-gray-500">
                No matching historical memories found for "{searchQuery}".
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-xs text-gray-400 font-medium px-1 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Found {searchResults.length} relevant historical context records:</span>
                </div>
                {searchResults.map((result) => (
                  <div
                    key={`${result.type}-${result.id}`}
                    className="p-4 bg-gray-950/70 border border-gray-800 rounded-xl space-y-2 hover:border-gray-700 transition-all"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-mono border ${
                            result.type === 'memory'
                              ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30'
                              : result.type === 'summary'
                                ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                : 'bg-gray-500/10 text-gray-400 border-gray-500/30'
                          }`}
                        >
                          {result.type}
                        </span>
                        {result.category && (
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${getCategoryColor(
                              result.category,
                            )}`}
                          >
                            {result.category.replace('_', ' ')}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-gray-500 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatDate(result.timestamp)}
                      </span>
                    </div>

                    <p className="text-sm text-gray-200 leading-relaxed font-sans">
                      {result.content}
                    </p>

                    {result.conversationTitle && result.conversationId && (
                      <div className="pt-2 border-t border-gray-900 flex items-center justify-between text-xs">
                        <span className="text-gray-500 text-[11px] flex items-center gap-1">
                          <MessageSquare className="w-3 h-3" />
                          Source: <strong className="text-gray-400">{result.conversationTitle}</strong>
                        </span>
                        <button
                          onClick={() => {
                            onSelectConversation(result.conversationId!);
                            onClose();
                          }}
                          className="text-indigo-400 hover:text-indigo-300 text-xs flex items-center gap-1 hover:underline"
                        >
                          <span>Open Chat</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )
          ) : memories.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-gray-800 flex items-center justify-center text-gray-500 mx-auto">
                <Brain className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-medium text-gray-300">No Memories Stored Yet</h3>
              <p className="text-xs text-gray-500 max-w-sm mx-auto">
                As you chat about projects, tech stacks, decisions, and preferences, ContextMind
                automatically extracts and preserves durable facts across conversations.
              </p>
            </div>
          ) : (
            /* Regular Memories View */
            memories.map((mem) => (
              <div
                key={mem.id}
                className="group relative p-4 bg-gray-950/60 border border-gray-800 rounded-xl space-y-2 hover:border-gray-700/80 transition-all"
              >
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-medium border ${getCategoryColor(
                        mem.category,
                      )}`}
                    >
                      {mem.category.replace('_', ' ')}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] bg-gray-800 text-gray-400 flex items-center gap-1">
                      <Shield className="w-2.5 h-2.5" />
                      {mem.sourceType === 'user_provided' ? 'User Statement' : 'Inference'}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-gray-500 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {formatDate(mem.originalTimestamp)}
                    </span>
                    <button
                      onClick={() => void handleDelete(mem.id)}
                      disabled={deletingId === mem.id}
                      className="text-gray-500 hover:text-red-400 p-1 rounded hover:bg-gray-800 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Delete memory"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <p className="text-sm text-gray-200 leading-relaxed font-sans">{mem.content}</p>

                {mem.sourceConversationTitle && mem.sourceConversationId && (
                  <div className="pt-2 border-t border-gray-900 flex items-center justify-between text-xs">
                    <span className="text-gray-500 text-[11px] flex items-center gap-1">
                      <MessageSquare className="w-3 h-3" />
                      Originated from:{' '}
                      <strong className="text-gray-400">{mem.sourceConversationTitle}</strong>
                    </span>
                    <button
                      onClick={() => {
                        onSelectConversation(mem.sourceConversationId!);
                        onClose();
                      }}
                      className="text-indigo-400 hover:text-indigo-300 text-xs flex items-center gap-1 hover:underline"
                    >
                      <span>Jump to source</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-800 bg-gray-950 flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-indigo-400" />
            <span>Workspace Isolation Active</span>
          </div>
          <span>{memories.length} durable memories in vault</span>
        </div>
      </div>
    </div>
  );
}
