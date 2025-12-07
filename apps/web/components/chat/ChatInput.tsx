'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading: boolean;
}

export function ChatInput({ onSend, isLoading }: ChatInputProps) {
  const [input, setInput] = React.useState('');
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = () => {
    if (!input.trim() || isLoading) return;
    onSend(input);
    setInput('');
  };

  return (
    <div className="p-4 border-t border-border bg-background/80 backdrop-blur-lg">
      <div className="relative flex items-end gap-2 max-w-4xl mx-auto bg-muted/30 p-2 rounded-xl border border-border focus-within:ring-1 focus-within:ring-primary/50 transition-all">
        <div className="absolute left-3 top-3.5 mb-2">
            <Sparkles className="w-4 h-4 text-purple-500 animate-pulse" />
        </div>
        
        <Textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask Evolvx to deploy, analyze, or fix something..."
          className="min-h-[50px] max-h-[200px] w-full resize-none border-0 bg-transparent py-3 pl-8 pr-12 focus-visible:ring-0 shadow-none scrollbar-hide"
        />
        
        <Button 
            size="icon" 
            onClick={handleSubmit} 
            disabled={!input.trim() || isLoading}
            className={cn("mb-1 transition-all", input.trim() ? "bg-primary" : "bg-muted-foreground/20")}
        >
            <Send className="w-4 h-4" />
        </Button>
      </div>
      <p className="text-[10px] text-center mt-2 text-muted-foreground">
        AI can make mistakes. Please verify generated code and deployment plans.
      </p>
    </div>
  );
}
