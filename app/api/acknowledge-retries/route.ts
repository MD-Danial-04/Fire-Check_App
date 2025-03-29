import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

// This route is a utility to acknowledge pending webhook retries
// It will find webhooks in the logs and create 'form_responses' entries for each
// unique submission ID to prevent further processing through idempotency

export async function GET(req: Request) {
  // Only allowed in development/staging, not in production by default
  if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_RETRY_ACKNOWLEDGMENT) {
    return NextResponse.json({ 
      error: 'This endpoint is disabled in production for security reasons' 
    }, { status: 403 });
  }
  
  const url = new URL(req.url);
  const password = url.searchParams.get('password');
  const page = parseInt(url.searchParams.get('page') || '0', 10);
  const pageSize = parseInt(url.searchParams.get('limit') || '20', 10); // Reduced from 100 to 20
  const minDays = parseInt(url.searchParams.get('days') || '2', 10); // Default to last 2 days only
  
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
    skipped: 0,
    details: [] as any[]
  };
  
  try {
    // Create date range for filtering (default to last 2 days)
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - minDays);
    
    // Get recent webhook logs with valid payload structure
    // Apply more specific filters to reduce the number of logs to process
    const { data: webhookLogs, error: logsError } = await supabase
      .from('webhook_logs')
      .select('id, payload, status, created_at')
      .not('payload', 'is', null)
      .gt('created_at', startDate.toISOString())
      .not('status', 'eq', 'processed') // Don't process already successful webhooks
      .not('status', 'eq', 'acknowledged_retroactively') // Skip already acknowledged
      .order('created_at', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1); // Use range-based pagination
    
    if (logsError) {
      console.error('Error fetching webhook logs:', logsError);
      return NextResponse.json({ error: 'Failed to fetch webhook logs' }, { status: 500 });
    }
    
    if (!webhookLogs || webhookLogs.length === 0) {
      return NextResponse.json({ 
        message: 'No webhook logs found that need acknowledgment',
        page,
        pageSize,
        minDays
      }, { status: 200 });
    }
    
    results.found = webhookLogs.length;
    console.log(`Processing ${results.found} logs from page ${page}`);
    
    // Get all existing submissions in one query to avoid multiple DB calls
    const formIds = webhookLogs
      .map(log => log.payload?.data?.submissionId)
      .filter(Boolean);
      
    const { data: existingResponses, error: existingError } = await supabase
      .from('form_responses')
      .select('response_id')
      .in('response_id', formIds);
      
    if (existingError) {
      console.error('Error checking existing responses:', existingError);
      return NextResponse.json({ error: 'Failed to check existing responses' }, { status: 500 });
    }
    
    // Create a Set of existing submission IDs for fast lookup
    const existingSubmissionIds = new Set(
      (existingResponses || []).map(r => r.response_id)
    );
    
    // Process each webhook log
    for (const log of webhookLogs) {
      try {
        // Skip logs without proper payload structure
        if (!log.payload?.data?.submissionId) {
          results.skipped++;
          continue;
        }
        
        const submissionId = log.payload.data.submissionId;
        const formId = log.payload.data.formId || 'unknown';
        
        // Check if this submission is already in form_responses using our pre-fetched set
        if (existingSubmissionIds.has(submissionId)) {
          results.already_processed++;
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
        
        // Update the webhook log status (if needed, consider removing to save time)
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
    
    // Only return detailed results if a small number processed
    const detailsToReturn = results.details.length <= 10 ? results.details : 
      [...results.details.slice(0, 5), '...more...', ...results.details.slice(-5)];
    
    const hasMore = webhookLogs.length === pageSize;
    
    return NextResponse.json({ 
      success: true,
      summary: {
        webhooks_found: results.found,
        submissions_acknowledged: results.acknowledged,
        already_processed: results.already_processed,
        skipped: results.skipped,
        errors: results.errors
      },
      pagination: {
        page,
        pageSize,
        hasMore
      },
      nextPage: hasMore ? `/api/acknowledge-retries?password=${password}&page=${page + 1}&limit=${pageSize}&days=${minDays}` : null,
      details: detailsToReturn
    });
    
  } catch (error: any) {
    console.error('Error processing acknowledgment:', error);
    return NextResponse.json({ 
      error: `Failed to process acknowledgment: ${error.message}` 
    }, { status: 500 });
  }
} 