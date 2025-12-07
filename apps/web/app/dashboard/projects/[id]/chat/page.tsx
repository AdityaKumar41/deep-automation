'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { useChat } from '@/hooks/useChat';
import { ChatBubble } from '@/components/chat/ChatBubble';
import { ChatInput } from '@/components/chat/ChatInput';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';
import { Bot, Code, GitBranch, Rocket, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useApiClient } from '@/lib/api';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function ProjectChatPage() {
  const params = useParams();
  const projectId = params.id as string;
  const api = useApiClient();
  const { messages, sendMessage, isStreaming } = useChat(projectId);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  // Fetch project status
  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const res = await api.get(`/api/projects/${projectId}`);
      return res.data.project;
    },
    refetchInterval: (query) => {
      // Refetch every 3 seconds if analyzing
      return query.state.data?.status === 'ANALYZING' ? 3000 : false;
    },
  });

  // Auto-scroll to bottom
  React.useEffect(() => {
    if (scrollRef.current) {
        scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const isAnalyzing = project?.status === 'ANALYZING';

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)]">
      {/* Analyzing Status Banner */}
      {isAnalyzing && (
        <Alert className="mb-4 bg-yellow-500/10 border-yellow-500/50">
          <Loader2 className="h-4 w-4 animate-spin" />
          <AlertDescription className="ml-2">
            <span className="font-semibold">Analyzing repository...</span>
            <span className="text-sm text-muted-foreground ml-2">
              I'm learning about your codebase. This will take a few seconds.
            </span>
          </AlertDescription>
        </Alert>
      )}

      {/* Chat Window */}
      <div className="flex-1 flex flex-col bg-card border border-border rounded-xl overflow-hidden shadow-2xl">
        <div className="flex-1 overflow-hidden relative">
          <ScrollArea className="h-full p-4">
              {messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center space-y-8 p-8 opacity-0 animate-in fade-in slide-in-from-bottom-4 duration-700 fill-mode-forwards" style={{ opacity: 1 }}>
                      <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                          <Bot className="w-10 h-10 text-primary" />
                      </div>
                      <div className="text-center space-y-2 max-w-lg">
                         <h2 className="text-2xl font-bold">Project AI Assistant</h2>
                         <p className="text-muted-foreground">
                             I have analyzed your repository and can answer questions about your code, architecture, dependencies, and deployment configurations.
                         </p>
                      </div>

                      <div className="grid grid-cols-2 gap-4 w-full max-w-2xl">
                         {[
                             { icon: Code, label: "Explain the codebase", desc: "Overview of architecture" },
                             { icon: GitBranch, label: "List dependencies", desc: "Show all packages" },
                             { icon: Rocket, label: "Deployment best practices", desc: "Optimize configuration" },
                             { icon: Bot, label: "Find potential issues", desc: "Code review suggestions" },
                         ].map((item, i) => (
                            <Card 
                              key={i} 
                              className="p-4 cursor-pointer hover:border-primary/50 hover:bg-muted/50 transition-all group"
                              onClick={() => sendMessage(item.label)}
                            >
                                 <div className="flex items-center gap-3">
                                     <div className="p-2 bg-muted rounded-md group-hover:bg-background transition-colors">
                                         <item.icon className="w-4 h-4" />
                                     </div>
                                     <div className="text-left">
                                         <div className="font-semibold text-sm">{item.label}</div>
                                         <div className="text-xs text-muted-foreground">{item.desc}</div>
                                     </div>
                                 </div>
                            </Card>
                         ))}
                      </div>
                  </div>
              ) : (
                  <div className="space-y-6 max-w-4xl mx-auto pb-4">
                      {messages.map((msg) => (
                          <ChatBubble key={msg.id} message={msg} />
                      ))}
                      <div ref={scrollRef} />
                  </div>
              )}
          </ScrollArea>
        </div>

        <ChatInput onSend={sendMessage} isLoading={isStreaming} />
      </div>
    </div>
  );
}
