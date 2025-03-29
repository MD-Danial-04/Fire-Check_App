import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import nacl from 'tweetnacl';
import { decodeBase64, encodeUTF8 } from 'tweetnacl-util';
import { createHash } from 'crypto'; // Node.js crypto for SHA-256

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

// Add FormSG Public Keys directly
const FORMSG_PUBLIC_KEYS = {
  production: '3Tt8VduXsjjd4IrpdCd7BAkdZl/vUCstu9UvTX84FWw=',
  staging: 'rjv41kYqZwcbe3r6ymMEEKQ+Vd+DPuogN+Gzq3lP2Og='
};

// Constants for manual verification
const SIGNATURE_TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000; // 5 minutes

const formsgMode = process.env.FORMSG_MODE === 'staging' ? 'staging' : 'production';
console.log(`Using FormSG mode: ${formsgMode}`);

// Rename key variable for clarity
const FORM_SECRET_KEY_B64 = process.env.FORMSG_SECRET_KEY || '';
if (FORM_SECRET_KEY_B64) {
  const keyBuffer = Buffer.from(FORM_SECRET_KEY_B64, 'base64');
  if (keyBuffer.length !== 32) { // 32 bytes = 256 bits
    console.error('Invalid key length. Expected 32 bytes after base64 decoding');
  }
} else if (process.env.NODE_ENV === 'production') {
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

// Add the missing interface definition
interface DecryptedFormField {
  _id: string;
  fieldType: string;
  question: string;
  answer?: string;
  answerArray?: string[] | string[][]; // Can be string array or nested array (e.g., for checkboxes in tables)
  [key: string]: any; // Allow for potential extra fields from FormSG v2.1+
}

// Helper for IP Check (Replace with proper CIDR check if needed)
function isIpAllowed(ip: string): boolean {
  // Get the appropriate IP whitelist based on mode
  const validIps = FORMSG_IP_WHITELIST[formsgMode as keyof typeof FORMSG_IP_WHITELIST];
  
  // Basic check - for production, consider using a library like 'ip-range-check' for CIDR.
  return validIps.includes(ip);
}

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  const requestHeaders = headers();
  const clientIp = requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const signatureHeader = requestHeaders.get('X-FormSG-Signature'); // Renamed variable
  const isTestMode = requestHeaders.get('X-Test-Mode') === 'true';

  let logId: number | null = null;
  let body: any; // Declare body outside try block

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
      status: 'received'
    });

    // --- Test Mode Handling / Production Verification & Decryption ---
    let processedData: DecryptedFormField[] | null = null; // Unified variable
    let submissionId: string | null = body?.data?.submissionId || null; // Get submissionId early

    if (isTestMode) {
      // ... (existing test mode logic remains unchanged) ...
      // Ensure test mode assigns to processedData
       if (!body.data || !body.data.encryptedContent) {
           console.warn('Test mode payload missing data.encryptedContent');
           await updateWebhookLogStatus(supabase, logId, 'failed', 'Missing encrypted content in test payload');
           return NextResponse.json({ error: 'Missing encrypted content' }, { status: 400 });
       }
       try {
         const decodedContent = Buffer.from(body.data.encryptedContent, 'base64').toString('utf-8');
         const testData = JSON.parse(decodedContent);
         if (Array.isArray(testData)) {
            processedData = testData as DecryptedFormField[]; // Assign to processedData
            console.log('Test mode decoded content processed.');
            await updateWebhookLogStatus(supabase, logId, 'test_processed', null);
         } else {
            console.error('Test mode decoded content was not an array:', testData);
            await updateWebhookLogStatus(supabase, logId, 'failed', 'Test mode decoded content invalid structure');
            return NextResponse.json({ error: 'Invalid test payload structure' }, { status: 400 });
         }
       } catch (error: any) {
         console.error('Failed to decode/parse test payload:', error);
         await updateWebhookLogStatus(supabase, logId, 'failed', `Test mode decoding error: ${error.message}`);
         return NextResponse.json({ error: 'Failed to decode test payload' }, { status: 400 });
       }

    } else {
      // --- Production Verification & Decryption ---
      console.log(`Production submission received (ID: ${submissionId})`);

      // 1. Check Prerequisites
      if (!signatureHeader) { // Use renamed variable
      console.warn('Missing X-FormSG-Signature header');
      await updateWebhookLogStatus(supabase, logId, 'failed', 'Missing signature');
      return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
    }
       if (!body.data || !body.data.encryptedContent || !submissionId || !body.data.formId) {
          console.warn('Webhook payload missing data fields (encryptedContent, submissionId, formId)');
          await updateWebhookLogStatus(supabase, logId, 'failed', 'Missing required data fields');
          return NextResponse.json({ error: 'Missing required data fields' }, { status: 400 });
       }
       if (!FORM_SECRET_KEY_B64) { // Use renamed variable
         console.error('Cannot process: FORMSG_SECRET_KEY is not set.');
            await updateWebhookLogStatus(supabase, logId, 'error', 'Server configuration error: Secret key missing');
            return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
        }
       const { formId, encryptedContent, version } = body.data;

      // 2. Parse Signature Header (Manual)
       const signatureElems = signatureHeader.split(',').reduce((acc, elem) => {
         const [key, value] = elem.trim().split('=');
         acc[key] = value;
         return acc;
       }, {} as Record<string, string>);

       const providedTimestamp = parseInt(signatureElems.t, 10);
       const providedSubmissionId = signatureElems.s;
       const providedFormId = signatureElems.f;
       const providedSignature = signatureElems.v1;

       if (!providedTimestamp || !providedSubmissionId || !providedFormId || !providedSignature) {
          console.error('Invalid signature header format:', signatureHeader);
          await updateWebhookLogStatus(supabase, logId, 'failed', 'Invalid signature header format');
          return NextResponse.json({ error: 'Invalid signature header format' }, { status: 400 });
       }
       if (providedSubmissionId !== submissionId || providedFormId !== formId) {
           console.error('Mismatch between signature header and payload IDs');
           await updateWebhookLogStatus(supabase, logId, 'failed', 'Signature header does not match payload');
           return NextResponse.json({ error: 'Signature header does not match payload' }, { status: 400 });
       }
       console.log(`Signature details: t=${providedTimestamp}, s=${providedSubmissionId}, f=${providedFormId}`);


      // 3. Verify Timestamp (Manual)
       const currentTimestamp = Date.now();
       if (currentTimestamp - providedTimestamp > SIGNATURE_TIMESTAMP_TOLERANCE_MS) {
         console.error(`Timestamp validation failed: ${currentTimestamp} - ${providedTimestamp} > ${SIGNATURE_TIMESTAMP_TOLERANCE_MS}`);
         await updateWebhookLogStatus(supabase, logId, 'failed', 'Timestamp validation failed');
         return NextResponse.json({ error: 'Timestamp validation failed' }, { status: 400 });
       }
        console.log('Timestamp validation passed.');

      // 4. Construct Basestring (Manual)
       const webhookUrl = req.url; // Get the full URL the request hit
       if (!webhookUrl) {
           console.error('Could not determine webhook URL from request');
           await updateWebhookLogStatus(supabase, logId, 'error', 'Server configuration error: Cannot determine webhook URL');
           return NextResponse.json({ error: 'Server configuration error: Cannot determine webhook URL' }, { status: 500 });
       }
       const baseString = `${webhookUrl}.${providedSubmissionId}.${providedFormId}.${providedTimestamp}`;
       console.log(`Constructed basestring: ${baseString.substring(0, 100)}...`); // Log prefix

      // 5. Verify Signature (Manual)
       const formsgPublicKeyBase64 = FORMSG_PUBLIC_KEYS[formsgMode];
       const formsgPublicKey = decodeBase64(formsgPublicKeyBase64);
       const signatureBytes = decodeBase64(providedSignature);
       // @ts-ignore - Linter seems confused, encodeUTF8 returns Uint8Array
       const baseStringBytes = encodeUTF8(baseString);

       // @ts-ignore - Linter seems confused, types are Uint8Array as expected
       const isSignatureValid = nacl.sign.detached.verify(baseStringBytes, signatureBytes, formsgPublicKey);

       if (!isSignatureValid) {
         console.error('Signature verification failed!');
         // Log details that might help debugging signature issues
         console.error(`Webhook URL used: ${webhookUrl}`);
         console.error(`Basestring prefix used: ${baseString.substring(0,100)}...`);
         console.error(`Submission ID: ${providedSubmissionId}`);
         console.error(`Form ID: ${providedFormId}`);
         console.error(`Timestamp: ${providedTimestamp}`);
         console.error(`Public Key (Base64): ${formsgPublicKeyBase64}`);
         console.error(`Mode: ${formsgMode}`);
         console.error(`Provided Signature (Base64): ${providedSignature}`);
         await updateWebhookLogStatus(supabase, logId, 'failed', 'Invalid signature');
         return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
       }
       console.log(`Signature verified successfully for submission ${submissionId}.`);
       await updateWebhookLogStatus(supabase, logId, 'signature_verified', null);

      // --- Manual Decryption ---
      console.log('Attempting manual decryption...');
      console.log('FormSG payload version:', version);
      console.log('Encrypted content length:', encryptedContent?.length || 0);
      const encryptionPrefix = encryptedContent?.substring(0, 30) + '...';
      console.log('Encrypted content format:', encryptionPrefix);
      await updateWebhookLogStatus(supabase, logId, 'decryption_started', 
        `Manual decryption for ${encryptedContent?.length} bytes, v${version}, format: ${encryptionPrefix}`);

       // 6. Derive Nonce (Manual)
        const hash = createHash('sha256').update(submissionId).digest();
        const nonce = new Uint8Array(hash.buffer, hash.byteOffset, 24); // Get first 24 bytes
        console.log(`Derived nonce for submissionId: ${submissionId}`);

       // 7. Decrypt Content (Manual)
        try {
            const secretKeyBytes = decodeBase64(FORM_SECRET_KEY_B64);
            const encryptedContentBytes = decodeBase64(encryptedContent);
            const decryptedBytes = nacl.secretbox.open(encryptedContentBytes, nonce, secretKeyBytes);

            if (!decryptedBytes) {
              console.error('Manual decryption failed! nacl.secretbox.open returned null.');
              console.error(`Secret Key Length (bytes): ${secretKeyBytes.length}`);
              console.error(`Encrypted Content Length (bytes): ${encryptedContentBytes.length}`);
              console.error(`Nonce Length (bytes): ${nonce.length}`);
              console.error(`Nonce prefix (hex): ${Buffer.from(nonce.slice(0, 4)).toString('hex')}`);
              await updateWebhookLogStatus(supabase, logId, 'failed', 'Decryption failed (nacl returned null)');
              return NextResponse.json({ error: 'Decryption failed' }, { status: 400 });
            }
            console.log(`Manual decryption successful for submission ${submissionId}.`);

            const decryptedString = encodeUTF8(decryptedBytes);
            const decryptedJson = JSON.parse(decryptedString);

            // Basic validation: Check if it's an array
            if (!Array.isArray(decryptedJson)) {
                console.error('Decrypted content is not an array:', decryptedJson);
                await updateWebhookLogStatus(supabase, logId, 'failed', 'Decrypted content invalid structure (not an array)');
                return NextResponse.json({ error: 'Decrypted content invalid structure' }, { status: 400 });
            }

            processedData = decryptedJson as DecryptedFormField[]; // Assign to processedData
            await updateWebhookLogStatus(supabase, logId, 'decrypted', null); // Log successful decryption

        } catch (error: any) {
             console.error('Error during manual decryption or JSON parsing:', error);
             await updateWebhookLogStatus(supabase, logId, 'failed', `Decryption/Parsing error: ${error.message}`);
             return NextResponse.json({ error: 'Failed to process submission content' }, { status: 500 });
        }
    } // End of production verification/decryption block

    // --- Process Decrypted/Test Data ---
    if (!processedData || !submissionId) {
        // Safety check
        console.error('No processed data available after verification/decryption or test mode.');
        await updateWebhookLogStatus(supabase, logId, 'error', 'Internal error: No data to process');
        return NextResponse.json({ error: 'Internal processing error' }, { status: 500 });
    }

    // --- Extract Data --- (Using processedData directly)
    let personName = 'Unknown';
    const formDataToSave: Record<string, any> = {};

    processedData.forEach((field: DecryptedFormField) => { // Add type annotation
        switch (field._id) {
            case FIELD_IDS.name:
                personName = field.answer || 'Unnamed';
                formDataToSave.personnel_name = personName; // Match table column
                break;
            case FIELD_IDS.vessel:
                formDataToSave.vessel_equipment = field.answer || 'N/A'; // Match table column
                break;
             case FIELD_IDS.lfav:
                 formDataToSave.lfav_equipment = field.answer || 'N/A'; // Match table column
                 break;
            default:
                 // Store other fields directly using question as key, if desired
                 // formDataToSave[field.question] = field.answer ?? field.answerArray ?? 'N/A';
                break;
        }
    });

    console.log(`Extracted Person: ${personName}, Data:`, formDataToSave);

    if (personName === 'Unknown' || !personName) { // Check extracted name
      const errorMsg = `Missing required fields after processing: submissionId=${submissionId}, personName=${personName}`;
      console.error(errorMsg);
      await updateWebhookLogStatus(supabase, logId, 'failed', errorMsg);
      return NextResponse.json({ error: 'Missing required fields after processing' }, { status: 400 });
    }

    // --- Save Response ---
    await saveResponseIdForPerson(supabase, personName, submissionId, formDataToSave);

    // --- Update Log Status ---
    await updateWebhookLogStatus(supabase, logId, 'processed', null); // Unified 'processed' status

    console.log(`Successfully processed FormSG submission: ${submissionId}`);
    return NextResponse.json({ message: 'Webhook received and processed successfully.', submissionId: submissionId }); // Return success and ID
    
  } catch (error: any) {
    console.error('Unhandled error in webhook processing:', error);
    // Ensure log status is updated even for unhandled errors
    await updateWebhookLogStatus(supabase, logId, 'error', error.message || 'Unknown processing error');
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// Interface for structured data storage (adjust as needed)
interface FormDataStructure {
  personnel_name?: string; // Match table column
  vessel_equipment?: string; // Match table column
  lfav_equipment?: string; // Match table column
  [key: string]: any; // Allow other fields
}

// Adapted save function to accept Supabase client instance and specific data
async function saveResponseIdForPerson(
  supabase: any, // Replace 'any' with the actual Supabase client type
  personName: string,
  responseId: string,
  formData: FormDataStructure // Use the defined interface for columns
) {
  if (!personName || personName === 'Unknown') {
    console.warn(`Skipping save for unknown person, response ID: ${responseId}`);
    return;
  }

  try {
    // --- Logic to potentially find/create person ---
    // This logic seems specific to a 'persons' table which might not be needed if
    // you are only inserting into 'form_responses'. Adapt if needed.
    // For now, we directly insert into 'form_responses' using the provided name.
    console.log(`Attempting to save response for ${personName} (${responseId})`);

    // Insert into form_responses table
  const { error } = await supabase
      .from('form_responses') // Target the correct table
    .insert({
        // Ensure column names match your Supabase table exactly
      personnel_name: personName,
      response_id: responseId,
        form_type: 'ppe_check_webhook', // Use your defined type
      submitted_at: new Date().toISOString(),
        form_data: formData // Store the extracted data object
    });

  if (error) {
      console.error(`Error inserting response for ${personName}, response ID ${responseId}:`, error);
      // Consider specific error handling (e.g., duplicate response_id)
      if (error.code === '23505') { // Unique violation
         console.warn(`Response ID ${responseId} already exists. Skipping insert.`);
         // Potentially update the existing record instead if needed
      } else {
         throw new Error(`Database insert failed: ${error.message}`); // Throw to be caught by main handler
      }
    } else {
      console.log(`Successfully saved response ${responseId} for ${personName}`);
    }

  } catch (error) {
    console.error(`Error in saveResponseIdForPerson for ${personName} (${responseId}):`, error);
    // Rethrow to allow the main handler to catch and log the error status
    throw error;
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