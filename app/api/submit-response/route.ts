import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Helper function to add CORS headers
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
  };
}

// Handle OPTIONS requests for CORS preflight
export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

export async function POST(request: Request) {
  try {
    const data = await request.json();
    const { responseId, personName } = data;

    // Validate input
    if (!responseId) {
      return NextResponse.json({
        success: false,
        message: 'Response ID is required'
      }, { 
        status: 400,
        headers: corsHeaders()
      });
    }

    // Save to database
    const { data: insertData, error } = await supabase
      .from('form_responses')
      .insert({
        personnel_name: personName || 'Unknown',
        response_id: responseId,
        form_type: 'ppe_check',
        submitted_at: new Date().toISOString()
      })
      .select();

    if (error) {
      console.error('Error saving response ID:', error);
      return NextResponse.json({
        success: false,
        message: error.message || 'Failed to save response ID'
      }, { 
        status: 500,
        headers: corsHeaders()
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Response ID saved successfully',
      data: insertData
    }, {
      headers: corsHeaders()
    });

  } catch (error) {
    console.error('Error in submit-response API:', error);
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : 'An unexpected error occurred'
    }, { 
      status: 500,
      headers: corsHeaders()
    });
  }
} 