import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function POST(req: Request) {
  // Only allow in development
  if (process.env.NODE_ENV === 'production') {
    return new Response('Not available in production', { status: 403 });
  }
  
  const supabase = createRouteHandlerClient({ cookies });
  const requestHeaders = headers();
  
  try {
    const body = await req.json();
    
    // Store the raw payload for inspection
    await supabase
      .from('webhook_logs')
      .insert({
        payload: body,
        source_ip: requestHeaders.get('x-forwarded-for') || 'unknown',
        headers: Object.fromEntries(requestHeaders.entries()),
        status: 'inspect',
        error_message: 'Inspection mode - raw payload stored for debugging'
      });
    
    return NextResponse.json({
      success: true,
      message: 'Webhook payload stored for inspection',
      payloadStructure: {
        keys: Object.keys(body),
        dataKeys: body.data ? Object.keys(body.data) : null,
        hasEncryptedContent: !!(body.data?.encryptedContent),
      }
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      message: `Error storing webhook: ${error.message}`
    }, { status: 500 });
  }
} 