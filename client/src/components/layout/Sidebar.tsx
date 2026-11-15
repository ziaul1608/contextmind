import React, { useState } from 'react';
import type { Conversation } from '@contextmind/shared';
import {
  MessageSquare,
  Plus,
  Search,
  Edit2,
  Trash2,
  Check,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  Brain,
} from 'lucide-react';

interface SidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  isLoading: boolean;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onRename: (id: string, newTitle: string) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  onOpenMemories?: () => void;
  isOpen: boolean;
  onToggle: () => void;
}

export function Sidebar({
  conversations,
  activeId,
  isLoading,
  searchQuery,
  onSearchChange,
  onSelect,
  onNewChat,
  onRename,
  onDelete,
  onOpenMemories,
  isOpen,
  onToggle,
}: SidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const startRename = (conv: Conversation, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(conv.id);
    setEditingTitle(conv.title);
  };

  const handleSaveRename = async (id: string, e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!editingTitle.trim()) return;
    await onRename(id, editingTitle.trim());
    setEditingId(null);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingId(id);
    await onDelete(id);
    setDeletingId(null);
  };

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-30 flex flex-col bg-gray-950 border-r border-gray-800 transition-all duration-300 md:static ${
        isOpen ? 'w-72' : 'w-0 -translate-x-full md:w-0 md:translate-x-0'
      } overflow-hidden`}
    >
      {/* Brand Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-800/80">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white shadow-md shadow-indigo-500/20">
            CM
          </div>
          <div>
            <h1 className="font-semibold text-white tracking-tight text-base leading-tight">
              Context<span className="text-indigo-400">Mind</span>
            </h1>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest font-mono">
              AI Assistant
            </p>
          </div>
        </div>
        <button
          onClick={onToggle}
          className="text-gray-400 hover:text-white p-1 rounded-md hover:bg-gray-800 transition-colors"
          title="Toggle sidebar"
        >
          <PanelLeftClose className="w-4 h-4" />
        </button>
      </div>

      {/* New Chat Button */}
      <div className="p-3">
        <button
          onClick={onNewChat}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-all shadow-sm hover:shadow-indigo-500/25 active:scale-[0.99]"
        >
          <Plus className="w-4 h-4" />
          <span>New Chat</span>
        </button>
      </div>

      {/* Search Input */}
      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-gray-500 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search conversations..."
            className="w-full pl-8 pr-3 py-1.5 bg-gray-900 border border-gray-800 text-gray-200 placeholder-gray-500 rounded-md text-xs focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>
      </div>

      {/* Conversation History List */}
      <div className="flex-1 overflow-y-auto px-2 space-y-1">
        {isLoading ? (
          <div className="p-4 text-center text-xs text-gray-500">
            Loading conversations...
          </div>
        ) : conversations.length === 0 ? (
          <div className="p-4 text-center text-xs text-gray-500">
            {searchQuery ? 'No matching conversations' : 'No conversations yet'}
          </div>
        ) : (
          conversations.map((conv) => {
            const isActive = conv.id === activeId;
            const isEditing = editingId === conv.id;

            return (
              <div
                key={conv.id}
                onClick={() => !isEditing && onSelect(conv.id)}
                className={`group relative flex items-center justify-between px-3 py-2 rounded-lg text-xs cursor-pointer transition-all ${
                  isActive
                    ? 'bg-gray-800/90 text-white border border-gray-700/60 shadow-sm'
                    : 'text-gray-400 hover:bg-gray-900/80 hover:text-gray-200'
                }`}
              >
                {isEditing ? (
                  <form
                    onSubmit={(e) => void handleSaveRename(conv.id, e)}
                    className="flex items-center gap-1 w-full"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="text"
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      autoFocus
                      className="flex-1 bg-gray-950 border border-indigo-500 text-white px-2 py-0.5 rounded text-xs focus:outline-none"
                    />
                    <button
                      type="submit"
                      className="text-green-400 hover:text-green-300 p-0.5"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="text-gray-400 hover:text-gray-200 p-0.5"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </form>
                ) : (
                  <>
                    <div className="flex items-center gap-2 overflow-hidden flex-1 mr-2">
                      <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 text-gray-500 group-hover:text-gray-300" />
                      <span className="truncate">{conv.title}</span>
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="text-[10px] text-gray-500 group-hover:hidden">
                        {formatDate(conv.updatedAt)}
                      </span>

                      <div className="hidden group-hover:flex items-center gap-1">
                        <button
                          onClick={(e) => startRename(conv, e)}
                          className="p-1 hover:text-white rounded hover:bg-gray-800"
                          title="Rename"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => void handleDelete(conv.id, e)}
                          disabled={deletingId === conv.id}
                          className="p-1 hover:text-red-400 rounded hover:bg-gray-800 disabled:opacity-50"
                          title="Delete"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Memory Vault Button */}
      {onOpenMemories && (
        <div className="p-2 border-t border-gray-800/80">
          <button
            onClick={onOpenMemories}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-gray-900/60 hover:bg-gray-800/80 border border-gray-800 text-xs text-gray-300 hover:text-white transition-all group"
          >
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-indigo-400 group-hover:text-indigo-300" />
              <span className="font-medium">Memory Vault</span>
            </div>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 font-mono">
              Workspace
            </span>
          </button>
        </div>
      )}

      {/* Footer Info */}
      <div className="p-3 border-t border-gray-800/80 text-[11px] text-gray-500 flex justify-between items-center">
        <span>ContextMind v1.0</span>
        <span className="inline-block w-2 h-2 rounded-full bg-green-500" title="Connected"></span>
      </div>
    </aside>
  );
}

export function SidebarTrigger({ onToggle }: { onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-850 transition-colors"
      title="Open sidebar"
    >
      <PanelLeftOpen className="w-5 h-5" />
    </button>
  );
}
