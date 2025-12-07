'use client';

import { ChatMessage } from '@/hooks/useChat';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { User, Bot } from 'lucide-react';
import { useUser } from '@clerk/nextjs';

export function ChatBubble({ message }: { message: ChatMessage }) {
  const { user } = useUser();
  const isUser = message.role === 'user';

  return (
    <div className={cn("flex w-full gap-4 p-4", isUser ? "flex-row-reverse" : "flex-row")}>
      <Avatar className="h-8 w-8 border border-border">
        {isUser ? (
             <AvatarImage src={user?.imageUrl} />
        ) : (
             <AvatarImage src="/bot-avatar.png" />
        )}
        <AvatarFallback className={isUser ? "bg-primary/10" : "bg-purple-500/10 text-purple-500"}>
            {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
        </AvatarFallback>
      </Avatar>
      
      <div className={cn(
        "flex flex-col max-w-[80%] space-y-2",
        isUser ? "items-end" : "items-start"
      )}>
         <div className={cn(
             "rounded-2xl px-4 py-3 text-sm shadow-sm",
             isUser 
                ? "bg-primary text-primary-foreground rounded-tr-none" 
                : "bg-muted/50 border border-border/50 text-foreground rounded-tl-none backdrop-blur-sm"
         )}>
            <div className="prose prose-sm dark:prose-invert max-w-none break-words">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {message.content || (message.isLoading ? "Thinking..." : "")}
                </ReactMarkdown>
            </div>
         </div>
         <span className="text-[10px] text-muted-foreground opacity-50">
             {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
         </span>
      </div>
    </div>
  );
}
