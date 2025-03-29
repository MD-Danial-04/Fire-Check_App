import { NextResponse } from 'next/server';
import { headers } from 'next/headers';

// Reuse the Field IDs from your actual webhook handler if possible,
// otherwise, redefine them here for testing.
// It's better to export/import them from a shared location.
const FIELD_IDS = {
  name: '6502c44bde2cb10011b4d19e',
  vessel: '6502d744356d4700127c28e4',
  lfav: '6502d8862ccd0f00122e8196'
} as const;

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

// FormSG environment public keys
const FORMSG_PUBLIC_KEYS = {
  production: '3Tt8VduXsjjd4IrpdCd7BAkdZl/vUCstu9UvTX84FWw=',
  staging: 'rjv41kYqZwcbe3r6ymMEEKQ+Vd+DPuogN+Gzq3lP2Og='
};

// Note: This endpoint should only be accessible in development
export async function GET(req: Request) {
  if (process.env.NODE_ENV === 'production') {
    console.warn('Attempted to access test webhook endpoint in production.');
    return NextResponse.json({ error: 'Endpoint not available in production' }, { status: 403 });
  }

  console.log('Generating test webhook payload...');

  // Determine environment mode based on environment variable (default to staging for testing)
  const formsgMode = process.env.FORMSG_MODE || 'staging';
  console.log(`Using FormSG mode: ${formsgMode}`);
  console.log(`Using secret key: ${process.env.FORMSG_SECRET_KEY ? process.env.FORMSG_SECRET_KEY.substring(0, 3) + '...' : 'None'}`);

  // Example FormSG signature format
  const timestamp = Date.now();
  const submissionId = `test-${timestamp}`;
  const formId = 'test-form-id-webhook';
  
  // Generate a test signature - won't validate cryptographically but has right format 
  const testSignature = `t=${timestamp},s=${submissionId},f=${formId},v1=testSignatureValue`;

  // For testing, we're creating a direct JSON structure instead of encrypting
  // In production, FormSG would encrypt this with your form's public key
  const sampleDecryptedPayload = {
    responses: [
      { _id: FIELD_IDS.name, question: 'Name', fieldType: 'textfield', answer: 'SGT1 Test User (Webhook)' },
      { _id: FIELD_IDS.vessel, question: 'Vessel Equipment', fieldType: 'textfield', answer: 'MRV-TEST / BP-WEB / CYL-HOOK' },
      { _id: FIELD_IDS.lfav, question: 'LFAV Equipment', fieldType: 'textfield', answer: 'LF-TEST / BP-HOOK / CYL-WEB' },
    ]
  };

  // In a normal situation, FormSG would encrypt this with your form's public key
  // For development, we use base64 to simulate an "encrypted" payload
  const placeholderEncryptedContent = Buffer.from(JSON.stringify(sampleDecryptedPayload)).toString('base64');
  
  // Instead of trying to decrypt this simulated payload and failing, we'll use test mode
  // Test mode signals the webhook handler to log but skip validation/decryption
  const testPayload = {
    data: {
      formId: formId,
      submissionId: submissionId,
      encryptedContent: placeholderEncryptedContent,
      version: 1
    }
  };

  const webhookUrl = new URL(req.url);
  webhookUrl.pathname = '/api/form-webhook';

  console.log(`Sending test payload to: ${webhookUrl.toString()}`);
  console.log('Test payload:', JSON.stringify(testPayload));

  try {
    // Select an IP from the appropriate whitelist
    const sourceIp = FORMSG_IP_WHITELIST[formsgMode as keyof typeof FORMSG_IP_WHITELIST][0];
    
    const response = await fetch(webhookUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': sourceIp, 
        'X-Test-Mode': 'true',
        'X-FormSG-Signature': testSignature
      },
      body: JSON.stringify(testPayload),
    });

    const responseText = await response.text();
    let responseBody;
    
    try {
      responseBody = JSON.parse(responseText);
    } catch (e) {
      responseBody = { error: "Could not parse response as JSON", rawResponse: responseText };
    }

    console.log('Test webhook response received:', responseBody);

    return NextResponse.json({
      success: response.status < 400,
      message: response.status < 400 ? 'Test webhook sent successfully.' : 'Webhook test failed',
      testPayloadSent: testPayload,
      webhookHandlerResponse: responseBody,
      status: response.status,
      mode: formsgMode,
      secretKeySet: !!process.env.FORMSG_SECRET_KEY, // Help debugging by indicating if key is present
    });

  } catch (error: any) {
    console.error('Error sending test webhook:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to send test webhook.',
      error: error.message
    }, { status: 500 });
  }
} 