"use client";

import * as React from "react";
import { ChatInput } from "./ChatInput";
import { ChatBubble } from "./ChatBubble";
import { useChat } from "@/hooks/useChat";
import { Loader2, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";

interface ChatWindowProps {
  projectId: string;
}

export function ChatWindow({ projectId }: ChatWindowProps) {
  const { messages, sendMessage, isStreaming } = useChat(projectId);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  React.useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return (
    <div className="h-full flex flex-col max-w-5xl mx-auto p-4">
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <Card className="p-8 text-center max-w-2xl border-dashed">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">AI Assistant Ready</h3>
              <p className="text-muted-foreground mb-4">
                Ask me anything about your project! I can help you with:
              </p>
              <div className="grid grid-cols-2 gap-3 text-sm text-left">
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="font-medium mb-1">🚀 Deployments</p>
                  <p className="text-muted-foreground text-xs">
                    Deploy, rollback, or check status
                  </p>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="font-medium mb-1">📊 Monitoring</p>
                  <p className="text-muted-foreground text-xs">
                    View metrics and logs
                  </p>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="font-medium mb-1">🔧 Configuration</p>
                  <p className="text-muted-foreground text-xs">
                    Update settings and secrets
                  </p>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="font-medium mb-1">🐛 Debugging</p>
                  <p className="text-muted-foreground text-xs">
                    Analyze errors and issues
                  </p>
                </div>
              </div>
            </Card>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <ChatBubble key={message.id} message={message} />
            ))}
            {isStreaming && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">AI is thinking...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input Area */}
      <div className="shrink-0">
        <ChatInput onSend={sendMessage} isLoading={isStreaming} />
      </div>
    </div>
  );
}
