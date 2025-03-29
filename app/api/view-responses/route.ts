import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function GET() {
  // Only allow in development
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 });
  }
  
  const supabase = createRouteHandlerClient({ cookies });
  
  try {
    const { data: formResponses, error: formError } = await supabase
      .from('form_responses')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);
    
    const { data: webhookLogs, error: logError } = await supabase
      .from('webhook_logs')
      .select('id, created_at, status, error_message')
      .order('created_at', { ascending: false })
      .limit(5);
    
    if (formError || logError) {
      return NextResponse.json({ 
        error: formError?.message || logError?.message 
      }, { status: 500 });
    }
    
    return NextResponse.json({ 
      formResponses, 
      webhookLogs,
      message: "If you see data, both tables exist and the webhook is working"
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
} 