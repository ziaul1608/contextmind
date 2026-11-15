import { useState, useCallback } from 'react';
import { Sidebar } from './components/layout/Sidebar';
import { ChatWorkspace } from './components/chat/ChatWorkspace';
import { ChatComposer } from './components/chat/ChatComposer';
import { MemoryModal } from './components/memory/MemoryModal';
import { useConversations } from './hooks/useConversations';
import { useChatStream } from './hooks/useChatStream';
import { useHealthCheck } from './hooks/useHealthCheck';
import { MessageRole, type Message } from '@contextmind/shared';

export default function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMemoryModalOpen, setIsMemoryModalOpen] = useState(false);
  const [input, setInput] = useState('');
  const [generalError, setGeneralError] = useState<string | null>(null);

  const health = useHealthCheck();

  const {
    conversations,
    activeConversationId,
    activeConversation,
    setActiveConversation,
    isLoadingList,
    searchQuery,
    setSearchQuery,
    selectConversation,
    createConversation,
    renameConversation,
    deleteConversation,
    fetchConversations,
    error: conversationsError,
  } = useConversations();

  // Callback invoked when an assistant message finishes streaming and is persisted
  const handleMessageDone = useCallback(
    (persistedAssistantMsg: Message) => {
      setActiveConversation((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          messages: [...prev.messages, persistedAssistantMsg],
        };
      });
      // Refresh list to bump updated conversation to top
      void fetchConversations();
    },
    [setActiveConversation, fetchConversations],
  );

  const { streamState, sendMessage, stopGenerating } = useChatStream(
    activeConversationId,
    handleMessageDone,
  );

  const handleSend = async (customContent?: string) => {
    const textToSend = (customContent || input).trim();
    if (!textToSend || streamState.isStreaming) return;
    setGeneralError(null);

    let targetConvId = activeConversationId;

    // If no conversation is active, create one first
    if (!targetConvId) {
      const created = await createConversation();
      if (!created) {
        setGeneralError('Could not start a new conversation. Please try again.');
        return;
      }
      targetConvId = created.id;
    }

    // Clear input if sending from composer, but keep textToSend for recovery
    if (!customContent) {
      setInput('');
    }

    // Optimistically append user message to active view immediately so it is never lost
    const optimisticId = `optimistic-${Date.now()}`;
    const optimisticUserMsg: Message = {
      id: optimisticId,
      conversationId: targetConvId,
      role: MessageRole.USER,
      content: textToSend,
      createdAt: new Date().toISOString(),
    };

    setActiveConversation((prev) => {
      const base = prev ?? {
        id: targetConvId!,
        workspaceId: '',
        title: 'New Conversation',
        summary: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [],
      };
      return {
        ...base,
        messages: [...base.messages, optimisticUserMsg],
      };
    });

    // Send message with target conversation ID passed explicitly
    await sendMessage(
      textToSend,
      targetConvId,
      (persistedUserMsg) => {
        // Reconcile optimistic message with the DB-persisted message
        setActiveConversation((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            messages: prev.messages.map((m) =>
              m.id === optimisticId ? persistedUserMsg : m,
            ),
          };
        });
      },
      (_errorMsg) => {
        // If request failed before persistence, restore draft into composer so user can retry
        if (!customContent) {
          setInput(textToSend);
        }
      },
    );
  };

  const handleNewChat = async () => {
    setGeneralError(null);
    const created = await createConversation();
    if (!created) {
      setGeneralError('Could not create new chat. Please try again.');
    }
  };

  const handleSelectPrompt = (prompt: string) => {
    setInput(prompt);
    void handleSend(prompt);
  };

  const displayedError = generalError || conversationsError || streamState.error;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gray-950 font-sans text-gray-100">
      {/* Collapsible Sidebar */}
      <Sidebar
        conversations={conversations}
        activeId={activeConversationId}
        isLoading={isLoadingList}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSelect={(id) => void selectConversation(id)}
        onNewChat={() => void handleNewChat()}
        onRename={renameConversation}
        onDelete={deleteConversation}
        onOpenMemories={() => setIsMemoryModalOpen(true)}
        isOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen((prev) => !prev)}
      />

      {/* Main Chat Workspace */}
      <main className="flex-1 flex flex-col min-w-0 h-full relative">
        <ChatWorkspace
          activeTitle={activeConversation?.title}
          messages={activeConversation?.messages || []}
          streamingText={streamState.currentAssistantText}
          streamingSources={streamState.currentSources}
          retrievedMemories={streamState.retrievedMemories}
          isStreaming={streamState.isStreaming}
          statusPhase={streamState.statusPhase}
          statusQuery={streamState.statusQuery}
          error={displayedError}
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
          onSelectPrompt={handleSelectPrompt}
          onOpenMemories={() => setIsMemoryModalOpen(true)}
          providers={health.data?.providers}
        />

        {/* Floating / Sticky Composer */}
        <ChatComposer
          input={input}
          onChange={setInput}
          onSend={() => void handleSend()}
          onStop={stopGenerating}
          isStreaming={streamState.isStreaming}
        />

        {/* Memory Vault Modal */}
        <MemoryModal
          isOpen={isMemoryModalOpen}
          onClose={() => setIsMemoryModalOpen(false)}
          onSelectConversation={(id) => void selectConversation(id)}
        />
      </main>
    </div>
  );
}
