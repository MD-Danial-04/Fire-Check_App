import { createBrowserClient } from '@supabase/ssr';
import { RealtimeChannel } from '@supabase/supabase-js';

// Create a singleton for the Supabase client
let supabaseInstance: ReturnType<typeof createBrowserClient> | null = null;
let isInitializing = false;
const activeChannels = new Set<string>();

export const MAX_RETRY_ATTEMPTS = 5;
export const INITIAL_RETRY_DELAY = 1000; // 1 second

/**
 * Gets a singleton Supabase client instance for browser contexts
 * Ensures only one instance is created across the application
 */
export const getSupabaseClient = () => {
  // Return existing instance if available
  if (supabaseInstance) return supabaseInstance;
  
  // Return null if we're not in the browser
  if (typeof window === 'undefined') return null;
  
  // Skip if we're already initializing
  if (isInitializing) return null;

  isInitializing = true;
  
  // Get the environment variables
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  // Log environment variables (but not the full key for security)
  console.log('NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl);
  console.log('NEXT_PUBLIC_SUPABASE_ANON_KEY available:', !!supabaseAnonKey);
  
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Supabase credentials missing. Check your environment variables.');
    console.error('Try using the hardcoded fallback values.');
    
    // Use hardcoded fallback values as a last resort
    try {
      console.log('Creating Supabase client with hardcoded credentials as fallback');
      supabaseInstance = createBrowserClient(
        'https://hpgabdmbsxthqskoqgoo.supabase.co',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwZ2FiZG1ic3h0aHFza29xZ29vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzU5MDAwOTQsImV4cCI6MjA1MTQ3NjA5NH0.o3MngGNfFL_vvwGu0P_JLX0bfiKEVKSbiJm1v8lVkjE',
        {
          realtime: {
            params: {
              eventsPerSecond: 2
            }
          },
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
          }
        }
      );
      
      if (supabaseInstance) {
        console.log('Supabase client initialized successfully with hardcoded values');
        isInitializing = false;
        return supabaseInstance;
      }
    } catch (fallbackError) {
      console.error('Failed to create Supabase client with hardcoded credentials:', fallbackError);
      isInitializing = false;
      return null;
    }
    
    isInitializing = false;
    return null;
  }
  
  try {
    console.log('Creating Supabase browser client instance');
    supabaseInstance = createBrowserClient(supabaseUrl, supabaseAnonKey, {
      realtime: {
        params: {
          eventsPerSecond: 2
        }
      },
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
    
    // Set auth token for realtime 
    supabaseInstance.realtime.setAuth(supabaseAnonKey);
    
    // Add a listener for connection status
    const systemChannel = supabaseInstance.channel('global-system-notifications');
    
    systemChannel
      .on('system', { event: 'connected' }, () => {
        console.log('Realtime connection established');
      })
      .on('system', { event: 'disconnected' }, () => {
        console.log('Realtime connection closed');
      })
      .subscribe((status: 'SUBSCRIBED' | 'CLOSED' | 'TIMED_OUT' | 'CHANNEL_ERROR') => {
        console.log('System channel status:', status);
      });
    
    console.log('Supabase client initialized successfully');
    isInitializing = false;
    return supabaseInstance;
  } catch (error) {
    console.error('Error initializing Supabase client:', error);
    isInitializing = false;
    return null;
  }
};

/**
 * Retries an operation with exponential backoff
 */
export const retryWithExponentialBackoff = async (
  operation: () => Promise<any>,
  maxRetries: number = MAX_RETRY_ATTEMPTS,
  baseDelay: number = INITIAL_RETRY_DELAY
): Promise<any> => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      
      const delay = Math.min(baseDelay * Math.pow(2, i), 10000); // Cap at 10 seconds
      console.log(`Retry attempt ${i + 1} failed. Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

/**
 * Cleans up all existing realtime channels
 */
export const cleanupAllChannels = (supabase: ReturnType<typeof createBrowserClient>) => {
  if (!supabase) return;
  
  console.log('Performing global channel cleanup');
  const channels = supabase.getChannels();
  
  // Clean up all channels
  channels.forEach((channel: RealtimeChannel) => {
    try {
      console.log(`Removing channel: ${channel.topic}`);
      supabase.removeChannel(channel);
    } catch (err) {
      console.warn('Error removing channel during cleanup:', err);
    }
  });
  
  // Clear the active channels tracking
  activeChannels.clear();
};

/**
 * Tracks and manages active channels
 */
export const trackChannel = (channelName: string) => {
  activeChannels.add(channelName);
};

/**
 * Removes a channel from tracking
 */
export const untrackChannel = (channelName: string) => {
  activeChannels.delete(channelName);
};

/**
 * Clears Supabase instance for testing
 */
export const resetSupabaseClient = () => {
  supabaseInstance = null;
  isInitializing = false;
  activeChannels.clear();
}; 