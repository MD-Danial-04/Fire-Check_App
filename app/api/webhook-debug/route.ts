import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import formsg from '@opengovsg/formsg-sdk';

// Initialize FormSG SDK
const formsgClient = formsg({
  mode: process.env.FORMSG_MODE === 'staging' ? 'staging' : 'production',
});

export async function POST(req: Request) {
  // Only allow in development
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 });
  }
  
  const supabase = createRouteHandlerClient({ cookies });
  const requestHeaders = headers();
  
  try {
    // Get FORM_SECRET_KEY from env
    const secretKey = process.env.FORMSG_SECRET_KEY || '';
    if (!secretKey) {
      return NextResponse.json({ error: 'FORMSG_SECRET_KEY is not set' }, { status: 500 });
    }
    
    // Validate environment mode
    const mode = process.env.FORMSG_MODE || 'production';
    
    // Extract request body
    const body = await req.json();
    if (!body.data || !body.data.encryptedContent) {
      return NextResponse.json({ 
        error: 'Missing required fields', 
        required: ['data.encryptedContent'] 
      }, { status: 400 });
    }
    
    // Log webhook information
    const webhookInfo = {
      mode,
      keyLength: secretKey.length,
      contentLength: body.data.encryptedContent.length,
      contentPrefix: body.data.encryptedContent.substring(0, 30) + '...',
      formId: body.data.formId,
      version: body.data.version,
      submissionId: body.data.submissionId,
      sdk_version: '0.13.0', // Current SDK version
    };
    
    console.log('Webhook debug info:', webhookInfo);
    
    // Attempt decryption
    let result = {};
    let decrypted = null;
    
    try {
      // Store diagnostic info in DB
      await supabase
        .from('webhook_logs')
        .insert({
          payload: body,
          source_ip: requestHeaders.get('x-forwarded-for') || 'unknown',
          headers: Object.fromEntries(requestHeaders.entries()),
          status: 'debug_attempt',
          error_message: 'Debug mode analysis',
          created_at: new Date().toISOString(),
        });
      
      if (body.data.encryptedContent?.startsWith('UEtD')) {
        console.log('Using decryptWithAttachments for UEtD format');
        decrypted = await formsgClient.crypto.decryptWithAttachments(secretKey, body.data);
      } else {
        console.log('Using standard decrypt method');
        decrypted = formsgClient.crypto.decrypt(secretKey, body.data);
      }
      
      // If we get here, decryption succeeded
      result = {
        success: true,
        message: 'Successfully decrypted webhook payload',
        keys: decrypted ? Object.keys(decrypted) : [],
        hasResponses: decrypted && 'responses' in decrypted,
        hasContent: decrypted && 'content' in decrypted,
        shape: decrypted ? 'Decrypted content available' : 'Unknown structure'
      };
    } catch (error: any) {
      // Decryption failed
      result = {
        success: false,
        error: error.message,
        errorType: error.name,
        errorStack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        suggestion: "The webhook format may not be compatible with the current SDK version. Contact FormSG support about v2.1 format compatibility."
      };
    }
    
    return NextResponse.json({
      info: webhookInfo,
      result
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      message: `Error in webhook debugging: ${error.message}`
    }, { status: 500 });
  }
} 