import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

// Endpoint to simulate a FormSG webhook
export async function POST(req: Request) {
  // Only allow in development or with override
  if (process.env.NODE_ENV === 'production') {
    const url = new URL(req.url);
    const devOverride = url.searchParams.get('dev_override');
    
    if (devOverride !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ 
        error: 'Not available in production without override' 
      }, { status: 403 });
    }
  }
  
  const supabase = createRouteHandlerClient({ cookies });
  
  try {
    // Generate a unique submission ID for testing
    const testSubmissionId = `test-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const personName = "Test User";
    
    // Create a test webhook record
    await supabase
      .from('webhook_logs')
      .insert({
        source_ip: '127.0.0.1',
        status: 'test_received',
        error_message: null,
        headers: {
          'x-test-mode': 'true',
          'content-type': 'application/json'
        },
        payload: {
          data: {
            submissionId: testSubmissionId,
            formId: 'test-form',
            created: new Date().toISOString(),
            encryptedContent: Buffer.from(JSON.stringify({
              responses: [
                {
                  _id: '6502c44bde2cb10011b4d19e', // name field ID
                  fieldType: 'textfield',
                  question: "Personnel Name",
                  answer: personName
                },
                {
                  _id: '672465bb2d53827806959ada', // BWC field ID
                  fieldType: 'textfield',
                  question: "BWC S/N",
                  answer: "TEST-BWC-001"
                }
              ]
            })).toString('base64')
          }
        }
      });
    
    // Insert directly into form_responses as well to test database access
    const { data: responseData, error: responseError } = await supabase
      .from('form_responses')
      .insert({
        personnel_name: personName,
        response_id: testSubmissionId,
        form_type: 'ppe_check',
        submitted_at: new Date().toISOString(),
        form_data: { bwc_sn: 'TEST-BWC-001', test_direct_insert: true }
      })
      .select();
    
    // Now call the actual webhook handler to test it
    const testRequest = new Request('https://fire-check-app.vercel.app/api/form-webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Test-Mode': 'true'
      },
      body: JSON.stringify({
        data: {
          submissionId: `${testSubmissionId}-actual`,
          formId: 'test-form-actual',
          created: new Date().toISOString(),
          encryptedContent: Buffer.from(JSON.stringify({
            responses: [
              {
                _id: '6502c44bde2cb10011b4d19e', // name field ID
                fieldType: 'textfield',
                question: "Personnel Name",
                answer: `${personName} (Actual)`
              },
              {
                _id: '672465bb2d53827806959ada', // BWC field ID
                fieldType: 'textfield',
                question: "BWC S/N",
                answer: "TEST-BWC-002"
              }
            ]
          })).toString('base64')
        }
      })
    });
    
    let actualWebhookResponse;
    try {
      // Call the webhook handler directly
      const response = await fetch(testRequest);
      actualWebhookResponse = await response.json();
    } catch (error: any) {
      actualWebhookResponse = {
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      };
    }
    
    // Check if the actual webhook created an entry
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for async processing
    
    const { data: createdByWebhook, error: webhookCheckError } = await supabase
      .from('form_responses')
      .select('*')
      .eq('response_id', `${testSubmissionId}-actual`)
      .maybeSingle();
    
    // Return diagnostic information
    return NextResponse.json({
      success: true,
      test_submission_id: testSubmissionId,
      direct_insert: {
        success: !responseError,
        data: responseData,
        error: responseError ? responseError.message : null
      },
      webhook_call: {
        response: actualWebhookResponse,
        created_entry: createdByWebhook || null,
        error: webhookCheckError ? webhookCheckError.message : null
      }
    });
  } catch (error: any) {
    return NextResponse.json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 });
  }
} 