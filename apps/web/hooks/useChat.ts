import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/nextjs';
import { toast } from 'sonner';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  isLoading?: boolean;
}

export const useChat = (projectId?: string) => {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const fetchedRef = useRef(false);

  // Fetch history on mount
  useEffect(() => {
    // Only proceed if auth is loaded, user is signed in, project ID exists, and we haven't fetched yet
    if (!isLoaded || !isSignedIn || !projectId || !getToken || fetchedRef.current) return;

    const fetchHistory = async () => {
      setIsLoadingHistory(true);
      try {
         const token = await getToken();
         if (!token) {
             // If token is missing despite isSignedIn, we might need to wait or it's a transient issue.
             // Don't mark as fetched so we can retry.
             return; 
         }

         console.log('Fetching chat history for project:', projectId);
         
         const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/chat/project/${projectId}/session`, {
            headers: {
               'Authorization': `Bearer ${token}`
            }
         });

         if (res.ok) {
             const data = await res.json();
             if (data.session?.messages) {
                 console.log('Loaded messages:', data.session.messages.length);
                 const formattedMessages = data.session.messages.map((m: any) => ({
                     id: m.id,
                     role: m.role.toLowerCase(),
                     content: m.content as string,
                     timestamp: new Date(m.createdAt).getTime()
                 }));
                 setMessages(formattedMessages);
             }
             // Only mark as fetched if request was successful (even if empty)
             fetchedRef.current = true;
         } else {
             console.error('Failed to fetch history:', res.status);
         }
      } catch (e) {
          console.error("Failed to fetch chat history", e);
      } finally {
          setIsLoadingHistory(false);
      }
    };

    fetchHistory();
  }, [projectId, getToken, isLoaded, isSignedIn]);

  const sendMessage = useCallback(async (content: string) => {
    console.log('📤 useChat.sendMessage called', { content, projectId });
    try {
      const token = await getToken();
      console.log('🔑 Token obtained:', !!token);
      if (!token) {
        toast.error("Unauthorized");
        return;
      }

      // Add user message locally
      const userMsg: ChatMessage = {
        id: Date.now().toString(),
        role: 'user',
        content,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, userMsg]);
      setIsStreaming(true);

      // Add placeholder assistant message
      const assistantMsgId = (Date.now() + 1).toString();
      setMessages(prev => [...prev, {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        isLoading: true
      }]);

      // Determine URL (if projectId is present, pass as query)
      const url = new URL(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/chat/messages/stream`);
      if (projectId) url.searchParams.append('projectId', projectId);
      url.searchParams.append('content', encodeURIComponent(content));

      // Use native EventSource? 
      // Problem: Native EventSource doesn't support custom headers (Authorization).
      // Solution: We typically use fetch() with ReadableStream for custom headers.
      // But MD explicitly said `new EventSource(...)`. 
      // If we use EventSource, we must pass token via Query Param (less secure) or use `event-source-polyfill` / `fetch`.
      // I will use `fetch` and consume the stream manually to support Auth Header properly.
      
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/chat/messages/stream?projectId=${projectId || ''}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ content, projectId })
      });

      if (!response.ok) throw new Error('Failed to send message');
      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
             if (line.startsWith('data: ')) {
                 const dataStr = line.replace('data: ', '');
                 if (dataStr === '[DONE]') {
                     setIsStreaming(false);
                     break;
                 }
                 try {
                     const data = JSON.parse(dataStr);
                     // Check for error messages from server
                     if (data.error) {
                         toast.error(data.error);
                         // Stop streaming on error
                         setIsStreaming(false);
                         setMessages(prev => prev.slice(0, -1)); // Remove loading message
                         return;
                     }

                     // Assuming data format: { content: "chunk", ... }
                     // Or full message object? The MD says `JSON.parse(e.data)`.
                     // Usually streaming sends chunks.
                     if (data.content) {
                         assistantContent += data.content;
                         setMessages(prev => prev.map(m => 
                            m.id === assistantMsgId 
                                ? { ...m, content: assistantContent, isLoading: false }
                                : m
                         ));
                     }
                 } catch (e) {
                     // ignore partial json
                 }
             }
        }
      }

    } catch (err: any) {
      console.error(err);
      toast.error('Failed to send message');
      setMessages(prev => prev.slice(0, -1)); // Remove failed assistant msg
    } finally {
      setIsStreaming(false);
    }
  }, [getToken, projectId]);

  return {
    messages,
    sendMessage,
    isStreaming,
    setMessages
  };
};
