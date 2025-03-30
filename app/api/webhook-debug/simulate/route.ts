import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { headers } from 'next/headers';

// Endpoint to simulate a FormSG webhook
export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  const requestHeaders = headers();
  const clientIp = requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const signature = requestHeaders.get('X-FormSG-Signature');
  const isTestMode = requestHeaders.get('X-Test-Mode') === 'true';

  let body;
  try {
    body = await req.json();
  } catch (e) {
    console.error("Failed to parse request body as JSON:", e);
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  // Extract submissionId for idempotency check
  const submissionId = body.data?.submissionId;
  if (!submissionId) {
    console.warn('Webhook payload missing submissionId');
    return NextResponse.json({ error: 'Missing submissionId' }, { status: 400 });
  }
  
  // Check if we've already processed this submissionId
  const { data: existingResponse } = await supabase
    .from('form_responses')
    .select('id')
    .eq('response_id', submissionId)
    .maybeSingle();
    
  if (existingResponse) {
    console.log(`Submission ${submissionId} already processed. Acknowledging retry.`);
    return NextResponse.json({ 
      success: true, 
      message: 'Already processed this submission',
      idempotent: true
    }, { status: 202 });
  }
  
  // Process synchronously in production for better reliability
  try {
    // Store webhook log
    const logId = await storeWebhookLog(supabase, {
      payload: body,
      source_ip: clientIp,
      headers: Object.fromEntries(requestHeaders.entries()),
      status: 'processing'
    });
    
    // Extract relevant fields from the form data
    // Assume test data with a name field and BWC field
    const testResponses = [
      { _id: '6502c44bde2cb10011b4d19e', answer: 'Test User' }, // name field
      { _id: '672465bb2d53827806959ada', answer: 'TEST-BWC-001' } // BWC field 
    ];
    
    // Save to form responses table
    try {
      const personName = testResponses[0].answer;
      const bwcSn = testResponses[1].answer;
      
      console.log('About to save form response to database:', {
        personName,
        submissionId,
        form_type: 'ppe_check',
        data: { bwc_sn: bwcSn }
      });
      
      // Insert into form_responses table
      const { data, error } = await supabase
        .from('form_responses')
        .insert({
          personnel_name: personName,
          response_id: submissionId,
          form_type: 'ppe_check',
          submitted_at: new Date().toISOString(),
          form_data: { bwc_sn: bwcSn }
        })
        .select();
        
      if (error) {
        console.error('Error saving response to database:', error);
        throw new Error(`Database insert failed: ${error.message}`);
      }
      
      console.log('Successfully saved form response for', personName);
      
      // Update log status
      await updateWebhookLogStatus(supabase, logId, 'processed', null);
    } catch (saveError: any) {
      console.error('Failed to save form response:', saveError);
      await updateWebhookLogStatus(supabase, logId, 'failed', `Database save error: ${saveError.message}`);
      throw saveError; // Rethrow to be caught by the main handler
    }
    
    // Return success response
    return NextResponse.json({ 
      success: true, 
      message: 'Webhook processed successfully',
      submissionId,
      test: true,
      diagnostics: {
        supabase_connection: 'succeeded',
        webhook_log_created: !!logId,
        form_response_saved: true
      }
    }, { status: 200 });
  } catch (error: any) {
    console.error('Error processing webhook:', error);
    return NextResponse.json({ 
      error: 'Server error during processing',
      message: error.message,
      diagnostics: {
        error_type: error.name,
        error_message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }
    }, { status: 500 });
  }
}

// Adapted logging function - inserts initial log entry
async function storeWebhookLog(
    supabase: any, // Replace 'any' with Supabase client type
    data: {
      payload: any;
      source_ip: string;
      headers: any;
      status?: string; // Optional initial status
      errorMessage?: string | null; // Optional initial error
    }
): Promise<number | null> {
  const { data: logEntry, error } = await supabase
    .from('webhook_logs')
    .insert({
      payload: data.payload,
      source_ip: data.source_ip,
      headers: data.headers,
      created_at: new Date().toISOString(),
      status: data.status || 'received', // Default to 'received'
      error_message: data.errorMessage || null
    })
    .select('id')
    .single(); // Expecting only one row back

  if (error) {
    // Log this failure, but don't crash the webhook processing itself
    console.error('CRITICAL: Failed to store webhook log:', error);
    return null; // Return null indicates logging failed
  }
  return logEntry?.id ?? null; // Return the ID of the created log entry
}

// Helper to update log status and error message
async function updateWebhookLogStatus(
    supabase: any, // Replace 'any' with Supabase client type
    logId: number | null,
    status: string,
    errorMessage: string | null
) {
    // If storing the log initially failed, we can't update it
    if (logId === null) {
        console.warn(`Cannot update webhook log status to '${status}' because initial logging failed.`);
        return;
    }

    const { error } = await supabase
        .from('webhook_logs')
        .update({
            status: status,
            error_message: errorMessage,
            processed_at: new Date().toISOString() // Mark when processing finished/failed
        })
        .eq('id', logId); // Target the specific log entry

    if (error) {
        // Log this failure, but don't crash the main flow
        console.error(`CRITICAL: Failed to update webhook log ${logId} status to '${status}':`, error);
    }
} 