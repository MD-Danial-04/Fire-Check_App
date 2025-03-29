import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import formsg from '@opengovsg/formsg-sdk'; // Import FormSG SDK (Removed FormField)

// Updated IP whitelist based on official FormSG IP addresses
const FORMSG_IP_WHITELIST = {
  production: [
    '52.76.82.38',
    '52.74.128.195',
    '122.248.228.153' // form.gov.sg
  ],
  staging: [
    '3.0.137.48',
    '18.140.124.240' // uat.form.gov.sg / staging.form.gov.sg
  ]
};

// FormSG environment public keys - for reference, the SDK already includes these
const FORMSG_PUBLIC_KEYS = {
  production: '3Tt8VduXsjjd4IrpdCd7BAkdZl/vUCstu9UvTX84FWw=',
  staging: 'rjv41kYqZwcbe3r6ymMEEKQ+Vd+DPuogN+Gzq3lP2Og='
};

// Initialize FormSG SDK - Ensure mode matches your FormSG environment (staging/production)
const formsgMode = process.env.FORMSG_MODE === 'staging' ? 'staging' : 'production';
console.log(`Using FormSG mode: ${formsgMode}`);

const formsgClient = formsg({
  mode: formsgMode,
});

// Retrieve secret key from environment variables
const FORM_SECRET_KEY = process.env.FORMSG_SECRET_KEY || '';
if (FORM_SECRET_KEY) {
  const keyBuffer = Buffer.from(FORM_SECRET_KEY, 'base64');
  if (keyBuffer.length !== 32) { // 32 bytes = 256 bits
    console.error('Invalid key length. Expected 32 bytes after base64 decoding');
    // Consider throwing an error during startup in production
  }
} else if (process.env.NODE_ENV === 'production') {
  // Log a critical error in production if the key is missing
  console.error('CRITICAL: FORMSG_SECRET_KEY environment variable is not set.');
} else {
  console.warn('Warning: FORMSG_SECRET_KEY environment variable is not set. Decryption will fail.');
}

// Your Field IDs (ensure these are correct for your form)
const FIELD_IDS = {
  name: '6502c44bde2cb10011b4d19e',
  vessel: '6502d744356d4700127c28e4',
  lfav: '6502d8862ccd0f00122e8196'
} as const;

// Helper for IP Check (Replace with proper CIDR check if needed)
function isIpAllowed(ip: string): boolean {
  // Get the appropriate IP whitelist based on mode
  const validIps = FORMSG_IP_WHITELIST[formsgMode as keyof typeof FORMSG_IP_WHITELIST];
  
  // Basic check - for production, consider using a library like 'ip-range-check' for CIDR.
  return validIps.includes(ip);
}

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies }); // Use server-side client
  const requestHeaders = headers();
  const clientIp = requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const signature = requestHeaders.get('X-FormSG-Signature');
  const isTestMode = requestHeaders.get('X-Test-Mode') === 'true'; // Support test mode

  let logId: number | null = null; // For updating log entry

  try {
    // --- IP Check ---
    // Skip IP check in test mode or development for easier testing
    if (!isTestMode && process.env.NODE_ENV === 'production') {
       if (!isIpAllowed(clientIp)) {
         console.warn(`Webhook received from disallowed IP: ${clientIp}`);
         // Optionally log this attempt before rejecting
         await storeWebhookLog(supabase, {
            payload: { error: 'Attempt from disallowed IP' }, // Avoid logging full payload from unknown IPs
            source_ip: clientIp,
            headers: Object.fromEntries(requestHeaders.entries()),
            status: 'rejected',
            errorMessage: 'Disallowed IP'
         });
         return NextResponse.json({ error: 'Unauthorized IP' }, { status: 403 });
       }
    }

    // Read body only once
    let body;
    try {
        body = await req.json();
    } catch (e) {
        console.error("Failed to parse request body as JSON:", e);
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }


    // --- Store Raw Log (Initial Entry) ---
    logId = await storeWebhookLog(supabase, {
      payload: body,
      source_ip: clientIp,
      headers: Object.fromEntries(requestHeaders.entries()),
      status: 'received' // Initial status
    });

    // --- Signature Verification ---
    if (!signature && !isTestMode) {
      console.warn('Missing X-FormSG-Signature header');
      await updateWebhookLogStatus(supabase, logId, 'failed', 'Missing signature');
      return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
    }

    // The SDK requires the full URL for verification
    const postUri = req.url;

    // Skip verification only in test mode
    if (!isTestMode) {
        // Ensure FORMSG_SECRET_KEY is set before proceeding in production
        if (!FORM_SECRET_KEY && process.env.NODE_ENV === 'production') {
            await updateWebhookLogStatus(supabase, logId, 'error', 'Server configuration error: Secret key missing');
            return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
        }
        try {
             formsgClient.webhooks.authenticate(signature!, postUri);
             // Note: authenticate throws error on failure
        } catch (e: any) {
            console.error('Invalid signature:', e.message);
            await updateWebhookLogStatus(supabase, logId, 'failed', `Invalid signature: ${e.message}`);
            return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
        }
    }

    // --- Decryption ---
    if (!body.data || !body.data.encryptedContent) {
      console.warn('Webhook payload missing data.encryptedContent');
      console.log('Received payload structure:', JSON.stringify(body));
      await updateWebhookLogStatus(supabase, logId, 'failed', 'Missing encrypted content');
      return NextResponse.json({ error: 'Missing encrypted content' }, { status: 400 });
    }

    // Add validation for encrypted content type
    if (typeof body.data.encryptedContent !== 'string') {
      console.error('Invalid encryptedContent type:', typeof body.data.encryptedContent);
      await updateWebhookLogStatus(supabase, logId, 'failed', 'Invalid encryptedContent format');
      return NextResponse.json({ error: 'Invalid payload format' }, { status: 400 });
    }

    let submission;
    const submissionId = body.data.submissionId;

    // For test mode, use a special path to avoid actual decryption
    if (isTestMode) {
      console.log('Test mode: Skipping decryption and using base64 decoded content directly');
      
      try {
        // In test mode, we just base64 decode the "encrypted" content
        const decodedContent = Buffer.from(body.data.encryptedContent, 'base64').toString('utf-8');
        submission = JSON.parse(decodedContent);
        console.log('Test mode decoded content:', JSON.stringify(submission));
        
        await updateWebhookLogStatus(supabase, logId, 'test_processed', null);
      } catch (error: any) {
        console.error('Failed to decode test payload:', error);
        await updateWebhookLogStatus(supabase, logId, 'failed', `Test mode decoding error: ${error.message}`);
        return NextResponse.json({ error: 'Failed to decode test payload' }, { status: 400 });
      }
    } else {
      // Production path using actual decryption
      // Ensure FORMSG_SECRET_KEY is available for decryption
      if (!FORM_SECRET_KEY) {
        console.error('Cannot decrypt: FORMSG_SECRET_KEY is not set.');
        await updateWebhookLogStatus(supabase, logId, 'error', 'Decryption key missing on server');
        // Don't expose key missing error directly in production response
        return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
      }

      console.log('Attempting to decrypt with key length:', FORM_SECRET_KEY.length);
      console.log('FormSG payload version:', body.data.version);
      console.log('Encrypted content length:', body.data.encryptedContent?.length || 0);
      
      // Store the first few characters of encrypted content for debugging
      const encryptionPrefix = body.data.encryptedContent?.substring(0, 30) + '...';
      console.log('Encrypted content format:', encryptionPrefix);
      
      // Backup the encrypted content and form details for troubleshooting
      await updateWebhookLogStatus(supabase, logId, 'decryption_started', 
        `Attempting to decrypt ${body.data.encryptedContent?.length} bytes, version ${body.data.version}, format: ${encryptionPrefix}`);
      
      try {
        // Check if this is an attachments-enabled form
        let decrypted: any; // Use 'any' type since SDK types are complex
        
        // Check specific format indicators in the encrypted content
        if (body.data.encryptedContent?.startsWith('UEtD')) {
          console.log('Using decryptWithAttachments method for UEtD format');
          decrypted = await formsgClient.crypto.decryptWithAttachments(FORM_SECRET_KEY, body.data);
        } else {
          console.log('Using standard decrypt method');
          try {
            // Try standard decryption first
            decrypted = await formsgClient.crypto.decrypt(FORM_SECRET_KEY, body.data);
            
            // Log successful decryption format for future reference
            console.log('Successfully decrypted using standard method');
          } catch (decryptError: any) {
            console.error('Primary decryption method failed (full error):', decryptError);
            await updateWebhookLogStatus(supabase, logId, 'decrypt_error', 
              `Primary decrypt failed: ${decryptError.message}`);
            
            // Provide helpful error about possible versioning issue
            console.error('The FormSG webhook is using v2.1 format, but the current SDK version (0.13.0) may not support it.');
            console.error('Consider checking with FormSG support about v2.1 format support.');
            
            // Log the form and webhook IDs for reference
            console.log('FormID:', body.data.formId);
            console.log('SubmissionID:', body.data.submissionId);
            
            throw new Error(`Decryption failed for FormSG v${body.data.version}: ${decryptError.message}`);
          }
        }

        // --- MODIFICATION: Log the raw result before checking ---
        console.log('Raw decryption result:', decrypted);
        // --- END MODIFICATION ---

        if (!decrypted || typeof decrypted !== 'object') {
          console.error('Decryption returned invalid result:', decrypted);
          await updateWebhookLogStatus(supabase, logId, 'failed', 'Invalid decryption result');
          return NextResponse.json({ error: 'Failed to decrypt submission' }, { status: 400 });
        }

        // Handle different possible shapes of the decrypted data based on version
        if ('responses' in decrypted) {
          submission = decrypted;
          console.log('Using direct responses from decrypted content');
        } else if ('content' in decrypted && decrypted.content) {
          submission = decrypted.content;
          console.log('Using content property from decrypted result');
        } else if ('data' in decrypted && decrypted.data?.responses) {
          // FormSG v2.x may have a different structure
          submission = decrypted.data;
          console.log('Using data.responses from v2.x structure');
        } else {
          // Log the structure to help debug
          // --- MODIFICATION: Log full object on unknown structure ---
          console.error('Unknown decrypted content structure (keys):', Object.keys(decrypted));
          console.error('Unknown decrypted content structure (full):', JSON.stringify(decrypted));
          // --- END MODIFICATION ---
          await updateWebhookLogStatus(supabase, logId, 'failed', 'Unrecognized decrypted content structure');
          return NextResponse.json({ error: 'Unrecognized content structure' }, { status: 400 });
        }
        
        // Added additional logging for content structure verification
        console.log('Decrypted content keys:', Object.keys(submission));
        
        // After successful decryption, add this validation:
        if (!Array.isArray(submission.responses)) {
          const errorMsg = 'Decrypted content has invalid format: missing responses array';
          console.error(errorMsg, 'Content keys:', Object.keys(submission));
          await updateWebhookLogStatus(supabase, logId, 'failed', errorMsg);
          return NextResponse.json({ error: 'Invalid decrypted content format' }, { status: 400 });
        }

        // Check if we have the expected minimum response count
        if (submission.responses.length < 3) {
          const errorMsg = `Decrypted content has too few responses: ${submission.responses.length}`;
          console.error(errorMsg);
          await updateWebhookLogStatus(supabase, logId, 'failed', errorMsg);
          return NextResponse.json({ error: 'Incomplete form submission' }, { status: 400 });
        }
      } catch (error: any) {
        console.error('Decryption error:', error);
        await updateWebhookLogStatus(supabase, logId, 'failed', `Decryption error: ${error.message}`);
        return NextResponse.json({ error: 'Failed to decrypt submission' }, { status: 400 });
      }
    }

    // --- Extract Data ---
    // The decrypted/decoded 'submission' contains the 'responses' array
    const responses = submission.responses; // Array of response items

    // Define a type for the response field to fix type errors
    interface FormField {
      _id: string;
      fieldType: string;
      question: string;
      answer?: string;
      answerArray?: string[] | string[][];
    }

    // Let TypeScript infer the type of 'r'
    const nameField = responses.find((r: FormField) => r._id === FIELD_IDS.name);
    const personName = nameField?.answer;

    // Add extraction for other fields if needed
    const vesselField = responses.find((r: FormField) => r._id === FIELD_IDS.vessel);
    const vesselEquipment = vesselField?.answer || '';
    const lfavField = responses.find((r: FormField) => r._id === FIELD_IDS.lfav);
    const lfavEquipment = lfavField?.answer || '';

    if (!submissionId || !personName) {
      const errorMsg = `Missing required fields after processing: submissionId=${submissionId}, personName=${personName}`;
      console.error(errorMsg);
      await updateWebhookLogStatus(supabase, logId, 'failed', errorMsg);
      return NextResponse.json({ error: 'Missing required fields after processing' }, { status: 400 });
    }

    // --- Save Response ---
    // Pass the necessary extracted data
    await saveResponseIdForPerson(supabase, personName, submissionId, {
      vessel_equipment: vesselEquipment,
      lfav_equipment: lfavEquipment,
      // Add other relevant decrypted data if needed
    });

    // --- Update Log Status ---
    await updateWebhookLogStatus(supabase, logId, isTestMode ? 'test_processed' : 'processed', null);

    console.log(`Successfully processed webhook for submissionId: ${submissionId}`);
    return NextResponse.json({ success: true, submissionId: submissionId });
    
  } catch (error: any) {
    console.error('Unhandled error in webhook processing:', error);
    // Ensure log status is updated even for unhandled errors
    await updateWebhookLogStatus(supabase, logId, 'error', error.message || 'Unknown processing error');
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// Adapted save function to accept Supabase client instance and specific data
async function saveResponseIdForPerson(
  supabase: any, // Replace 'any' with the actual Supabase client type
  personName: string,
  responseId: string, // Renamed submissionId to responseId for consistency with table
  formData: Record<string, any> // Pass specific data to store
) {
  const { error } = await supabase
    .from('form_responses')
    .insert({
      personnel_name: personName,
      response_id: responseId,
      form_type: 'ppe_check_webhook', // Differentiate from manual/bookmarklet submissions
      submitted_at: new Date().toISOString(),
      form_data: formData // Store relevant decrypted data
    });

  if (error) {
      console.error("Error saving response to DB:", error);
      // Rethrow to be caught by the main handler, which will update the log
      throw new Error(`Database insert failed: ${error.message}`);
  }
   console.log(`Saved form response for ${personName} with ID ${responseId}`);
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