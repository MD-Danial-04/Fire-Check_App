import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

// This route is a utility to acknowledge pending webhook retries
// It will find webhooks in the logs and create 'form_responses' entries for each
// unique submission ID to prevent further processing through idempotency

export async function GET(req: Request) {
  // Only allowed in development/staging, not in production
  if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_RETRY_ACKNOWLEDGMENT) {
    return NextResponse.json({ 
      error: 'This endpoint is disabled in production for security reasons' 
    }, { status: 403 });
  }
  
  const url = new URL(req.url);
  const password = url.searchParams.get('password');
  
  // Basic security check - require a password parameter
  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ 
      error: 'Unauthorized access' 
    }, { status: 401 });
  }
  
  const supabase = createRouteHandlerClient({ cookies });
  const results = {
    found: 0,
    acknowledged: 0,
    already_processed: 0,
    errors: 0,
    details: [] as any[]
  };
  
  try {
    // Get recent webhook logs with valid payload structure
    const { data: webhookLogs, error: logsError } = await supabase
      .from('webhook_logs')
      .select('id, payload, status')
      .not('payload', 'is', null)
      .order('created_at', { ascending: false })
      .limit(100); // Adjust as needed
    
    if (logsError) {
      console.error('Error fetching webhook logs:', logsError);
      return NextResponse.json({ error: 'Failed to fetch webhook logs' }, { status: 500 });
    }
    
    if (!webhookLogs || webhookLogs.length === 0) {
      return NextResponse.json({ message: 'No webhook logs found' }, { status: 200 });
    }
    
    results.found = webhookLogs.length;
    
    // Process each webhook log
    for (const log of webhookLogs) {
      try {
        // Skip logs without proper payload structure
        if (!log.payload?.data?.submissionId) {
          results.details.push({
            logId: log.id,
            status: 'skipped',
            reason: 'Missing submissionId in payload'
          });
          continue;
        }
        
        const submissionId = log.payload.data.submissionId;
        const formId = log.payload.data.formId || 'unknown';
        
        // Check if this submission is already in form_responses
        const { data: existingResponse } = await supabase
          .from('form_responses')
          .select('id')
          .eq('response_id', submissionId)
          .maybeSingle();
        
        if (existingResponse) {
          results.already_processed++;
          results.details.push({
            logId: log.id,
            submissionId,
            status: 'already_acknowledged',
            formId
          });
          continue;
        }
        
        // Create a placeholder entry in form_responses
        const { error: insertError } = await supabase
          .from('form_responses')
          .insert({
            personnel_name: 'ACKNOWLEDGED_RETRY',
            response_id: submissionId,
            form_type: 'ppe_check',
            submitted_at: new Date().toISOString(),
            form_data: {
              auto_acknowledged: true,
              formId: formId,
              logId: log.id
            }
          });
        
        if (insertError) {
          results.errors++;
          results.details.push({
            logId: log.id,
            submissionId,
            status: 'error',
            error: insertError.message
          });
          continue;
        }
        
        results.acknowledged++;
        results.details.push({
          logId: log.id,
          submissionId,
          status: 'acknowledged',
          formId
        });
        
        // Optionally update the webhook log status
        await supabase
          .from('webhook_logs')
          .update({ status: 'acknowledged_retroactively' })
          .eq('id', log.id);
          
      } catch (error: any) {
        results.errors++;
        results.details.push({
          logId: log.id,
          status: 'error',
          error: error.message
        });
      }
    }
    
    return NextResponse.json({ 
      success: true,
      summary: {
        webhooks_found: results.found,
        submissions_acknowledged: results.acknowledged,
        already_processed: results.already_processed,
        errors: results.errors
      },
      details: results.details
    });
    
  } catch (error: any) {
    console.error('Error processing acknowledgment:', error);
    return NextResponse.json({ 
      error: `Failed to process acknowledgment: ${error.message}` 
    }, { status: 500 });
  }
} 