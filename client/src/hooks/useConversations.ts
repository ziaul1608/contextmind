import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../api/client';
import type {
  Conversation,
  ConversationWithMessages,
  PaginatedResponse,
} from '@contextmind/shared';

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [activeConversation, setActiveConversation] =
    useState<ConversationWithMessages | null>(null);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isLoadingActive, setIsLoadingActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Fetch list of conversations
  const fetchConversations = useCallback(async (query?: string) => {
    setIsLoadingList(true);
    setError(null);
    try {
      const q = query !== undefined ? query : searchQuery;
      const params = q ? { q } : {};
      const { data } = await apiClient.get<{ data: PaginatedResponse<Conversation> }>(
        '/conversations',
        { params },
      );
      setConversations(data.data.items);
    } catch (err: unknown) {
      console.error('[ContextMind] Failed to fetch conversations:', err);
      setError('Could not load conversations.');
    } finally {
      setIsLoadingList(false);
    }
  }, [searchQuery]);

  // Initial load
  useEffect(() => {
    void fetchConversations();
  }, [fetchConversations]);

  // Load active conversation details when selection changes
  const selectConversation = useCallback(async (id: string | null) => {
    setActiveConversationId(id);
    if (!id) {
      setActiveConversation(null);
      return;
    }

    setIsLoadingActive(true);
    try {
      const { data } = await apiClient.get<{ data: ConversationWithMessages }>(
        `/conversations/${id}`,
      );
      setActiveConversation(data.data);
    } catch (err) {
      console.error('[ContextMind] Failed to load conversation:', err);
      setError('Could not load selected conversation.');
      setActiveConversation(null);
    } finally {
      setIsLoadingActive(false);
    }
  }, []);

  // Create new conversation
  const createConversation = useCallback(
    async (title?: string): Promise<Conversation | null> => {
      try {
        const payload = title ? { title } : {};
        const { data } = await apiClient.post<{ data: Conversation }>(
          '/conversations',
          payload,
        );
        const created = data.data;
        setConversations((prev) => [created, ...prev]);
        await selectConversation(created.id);
        return created;
      } catch (err) {
        console.error('[ContextMind] Failed to create conversation:', err);
        setError('Could not create new conversation.');
        return null;
      }
    },
    [selectConversation],
  );

  // Rename conversation
  const renameConversation = useCallback(
    async (id: string, newTitle: string): Promise<boolean> => {
      try {
        const { data } = await apiClient.patch<{ data: Conversation }>(
          `/conversations/${id}`,
          { title: newTitle },
        );
        const updated = data.data;

        setConversations((prev) =>
          prev.map((c) => (c.id === id ? { ...c, title: updated.title } : c)),
        );
        if (activeConversationId === id) {
          setActiveConversation((prev) =>
            prev ? { ...prev, title: updated.title } : null,
          );
        }
        return true;
      } catch (err) {
        console.error('[ContextMind] Failed to rename conversation:', err);
        setError('Could not rename conversation.');
        return false;
      }
    },
    [activeConversationId],
  );

  // Delete conversation
  const deleteConversation = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        await apiClient.delete(`/conversations/${id}`);
        setConversations((prev) => prev.filter((c) => c.id !== id));
        if (activeConversationId === id) {
          setActiveConversationId(null);
          setActiveConversation(null);
        }
        return true;
      } catch (err) {
        console.error('[ContextMind] Failed to delete conversation:', err);
        setError('Could not delete conversation.');
        return false;
      }
    },
    [activeConversationId],
  );

  return {
    conversations,
    activeConversationId,
    activeConversation,
    setActiveConversation,
    isLoadingList,
    isLoadingActive,
    searchQuery,
    setSearchQuery,
    error,
    fetchConversations,
    selectConversation,
    createConversation,
    renameConversation,
    deleteConversation,
  };
}
