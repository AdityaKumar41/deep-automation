'use client';

import { useEffect, useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Copy, 
  Download, 
  Pause, 
  Play, 
  Trash2,
  Loader2 
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface LogLine {
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS' | 'DEBUG';
  message: string;
}

interface TerminalProps {
  deploymentId: string;
  autoScroll?: boolean;
  height?: string;
  className?: string;
}

export function Terminal({ 
  deploymentId, 
  autoScroll = true, 
  height = '600px',
  className 
}: TerminalProps) {
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const shouldAutoScroll = useRef(autoScroll);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (shouldAutoScroll.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  // Connect to log stream
  useEffect(() => {
    if (!deploymentId) return;

    const baseURL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    const eventSource = new EventSource(
      `${baseURL}/api/deployments/${deploymentId}/logs/stream`,
      { withCredentials: true }
    );

    eventSourceRef.current = eventSource;
    setIsStreaming(true);
    setIsConnected(false);

    eventSource.onopen = () => {
      console.log('✅ Log stream connected');
      setIsConnected(true);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.done) {
          console.log('✅ Log stream completed');
          eventSource.close();
          setIsStreaming(false);
          setIsConnected(false);
          return;
        }

        if (data.log) {
          const logLine: LogLine = {
            timestamp: data.timestamp || new Date().toISOString(),
            level: data.level || 'INFO',
            message: data.log,
          };
          
          if (!isPaused) {
            setLogs((prev) => [...prev, logLine]);
          }
        }
      } catch (error) {
        console.error('Failed to parse log event:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('❌ Log stream error:', error);
      eventSource.close();
      setIsStreaming(false);
      setIsConnected(false);
    };

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [deploymentId, isPaused]);

  const handleCopyLogs = async () => {
    const logText = logs
      .map((log) => `[${new Date(log.timestamp).toLocaleTimeString()}] ${log.level}: ${log.message}`)
      .join('\n');
    
    try {
      await navigator.clipboard.writeText(logText);
      // TODO: Show toast notification
    } catch (error) {
      console.error('Failed to copy logs:', error);
    }
  };

  const handleDownloadLogs = () => {
    const logText = logs
      .map((log) => `[${new Date(log.timestamp).toLocaleTimeString()}] ${log.level}: ${log.message}`)
      .join('\n');
    
    const blob = new Blob([logText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `deployment-${deploymentId}-logs.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleClearLogs = () => {
    setLogs([]);
  };

  const togglePause = () => {
    setIsPaused(!isPaused);
  };

  const toggleAutoScroll = () => {
    shouldAutoScroll.current = !shouldAutoScroll.current;
  };

  const getLogLevelColor = (level: LogLine['level']) => {
    switch (level) {
      case 'ERROR':
        return 'text-red-400';
      case 'WARN':
        return 'text-yellow-400';
      case 'SUCCESS':
        return 'text-green-400';
      case 'DEBUG':
        return 'text-gray-500';
      default:
        return 'text-blue-400';
    }
  };

  const getLogLevelBadge = (level: LogLine['level']) => {
    const colors = {
      ERROR: 'bg-red-500/20 text-red-400 border-red-500/30',
      WARN: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      SUCCESS: 'bg-green-500/20 text-green-400 border-green-500/30',
      DEBUG: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
      INFO: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    };

    return (
      <span className={cn(
        'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border',
        colors[level]
      )}>
        {level}
      </span>
    );
  };

  return (
    <Card className={cn('bg-slate-950 border-slate-800', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CardTitle className="text-lg font-mono text-slate-200">
              Terminal
            </CardTitle>
            {isStreaming && (
              <div className="flex items-center gap-2 text-sm">
                <Loader2 className="h-4 w-4 animate-spin text-green-400" />
                <span className="text-green-400 font-medium">Streaming</span>
              </div>
            )}
            {isConnected && !isStreaming && (
              <div className="flex items-center gap-2 text-sm">
                <div className="h-2 w-2 rounded-full bg-green-400" />
                <span className="text-slate-400">Connected</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={togglePause}
              className="h-8 text-slate-400 hover:text-slate-200"
              title={isPaused ? 'Resume' : 'Pause'}
            >
              {isPaused ? (
                <Play className="h-4 w-4" />
              ) : (
                <Pause className="h-4 w-4" />
              )}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleCopyLogs}
              className="h-8 text-slate-400 hover:text-slate-200"
              title="Copy logs"
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleDownloadLogs}
              className="h-8 text-slate-400 hover:text-slate-200"
              title="Download logs"
            >
              <Download className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleClearLogs}
              className="h-8 text-slate-400 hover:text-slate-200"
              title="Clear logs"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea 
          className="w-full" 
          style={{ height }}
          ref={scrollRef}
        >
          <div className="p-4 font-mono text-sm space-y-1">
            {logs.length === 0 ? (
              <div className="text-slate-500 italic">
                Waiting for logs...
              </div>
            ) : (
              logs.map((log, index) => (
                <div
                  key={index}
                  className="flex items-start gap-3 hover:bg-slate-900/50 px-2 py-1 rounded"
                >
                  <span className="text-slate-500 text-xs whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <span className="flex-shrink-0">
                    {getLogLevelBadge(log.level)}
                  </span>
                  <span className={cn('flex-1', getLogLevelColor(log.level))}>
                    {log.message}
                  </span>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
