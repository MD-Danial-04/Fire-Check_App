'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

// Define type for log entries for better type safety
interface WebhookLog {
  id: number;
  created_at: string;
  source_ip: string;
  status: string;
  error_message?: string | null;
  payload: any; // Keeping payload as any for flexibility, but could be typed further
}

export function WebhookMonitor() {
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClientComponentClient();

  const fetchRecentLogs = useCallback(async () => {
    console.log('Fetching recent webhook logs...');
    const { data, error: fetchError } = await supabase
      .from('webhook_logs')
      .select('id, created_at, source_ip, status, error_message, payload') // Select specific columns
      .order('created_at', { ascending: false })
      .limit(10);

    if (fetchError) {
      console.error('Error fetching webhook logs:', fetchError);
      setError(`Error fetching logs: ${fetchError.message}`);
      setLogs([]); // Clear logs on error
    } else {
      console.log('Fetched logs:', data);
      setLogs(data || []);
      setError(null); // Clear error on success
    }
  }, [supabase]);

  useEffect(() => {
    // Initial fetch
    fetchRecentLogs();

    // Subscribe to inserts on webhook_logs table
    const channel = supabase
      .channel('webhook-logs-inserts')
      .on<
        WebhookLog // Specify the type for the payload
       >(
        'postgres_changes', 
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'webhook_logs' 
        }, 
        (payload) => {
          console.log('Realtime webhook log received:', payload.new);
          // Add the new log to the beginning and keep the list size limited
          setLogs(current => [payload.new, ...current].slice(0, 10));
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log('Subscribed to webhook_logs changes.');
        } else {
          console.error('Failed to subscribe to webhook_logs:', err);
          setError(`Subscription error: ${err?.message || 'Unknown error'}`);
        }
      });

    // Cleanup function to remove the channel subscription
    return () => {
      console.log('Unsubscribing from webhook_logs changes.');
      supabase.removeChannel(channel).catch(err => console.error('Error removing channel:', err));
    };
  }, [supabase, fetchRecentLogs]); // Add fetchRecentLogs to dependency array

  const getStatusBadgeVariant = (status: string): "default" | "destructive" | "secondary" | "outline" => {
    switch (status?.toLowerCase()) {
      case 'processed': return "default"; // Use default (often primary color) for success
      case 'failed':
      case 'rejected':
      case 'error': return "destructive";
      case 'received': return "secondary";
      default: return "outline";
    }
  };

  return (
    <Card className="mt-6 border-dashed border-orange-400">
      <CardHeader>
        <CardTitle className="text-orange-500">Webhook Monitor (Dev Only)</CardTitle>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 border border-red-300 rounded">Error: {error}</div>
        )}
        <ScrollArea className="h-[400px] pr-4">
          <div className="space-y-4">
            {logs.length === 0 && !error && (
              <p className="text-center text-gray-500">No recent webhook logs found.</p>
            )}
            {logs.map(log => (
              <div key={log.id} className="p-4 border rounded bg-neutral-50 dark:bg-neutral-800">
                <div className="flex justify-between items-center text-sm mb-2 flex-wrap gap-2">
                  <span className="font-mono text-xs text-gray-600 dark:text-gray-400" title={log.created_at}>
                    {new Date(log.created_at).toLocaleString()}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">IP: {log.source_ip}</span>
                  <Badge variant={getStatusBadgeVariant(log.status)} className="text-xs capitalize">
                    {log.status || 'Unknown'}
                  </Badge>
                </div>
                {log.error_message && (
                  <div className="mb-2 p-2 text-xs bg-red-50 dark:bg-red-900/50 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 rounded">
                    Error: {log.error_message}
                  </div>
                )}
                <details className="mt-2">
                  <summary className="text-xs cursor-pointer text-blue-600 dark:text-blue-400">Show Payload</summary>
                  <pre className="mt-1 text-xs overflow-auto bg-gray-100 dark:bg-black p-2 rounded max-h-60">
                    {JSON.stringify(log.payload, null, 2)}
                  </pre>
                </details>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
} 