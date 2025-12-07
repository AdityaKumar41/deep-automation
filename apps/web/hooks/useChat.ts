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
  const { getToken } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  const sendMessage = useCallback(async (content: string) => {
    try {
      const token = await getToken();
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
        body: JSON.stringify({ content })
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
