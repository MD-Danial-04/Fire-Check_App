import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function GET(req: Request) {
  // Only allow in development
  if (process.env.NODE_ENV === 'production') {
    // For safety, restrict in production
    const url = new URL(req.url);
    const devOverride = url.searchParams.get('dev_override');
    
    // Allow override in production with special parameter
    if (devOverride !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ 
        error: 'Not available in production without override' 
      }, { status: 403 });
    }
  }
  
  const supabase = createRouteHandlerClient({ cookies });
  
  try {
    // Create an object to store all the results
    const result: Record<string, any> = {
      timestamp: new Date().toISOString(),
      tables: {},
      errors: []
    };
    
    // Check if tables exist and get recent records
    const tables = [
      'webhook_logs',
      'form_responses',
      'equipment_checklist'
    ];
    
    // Check each table
    for (const table of tables) {
      try {
        // Check if table exists
        const { data: tableExists, error: tableError } = await supabase
          .from(table)
          .select('count(*)', { count: 'exact', head: true });
          
        if (tableError) {
          result.tables[table] = { 
            exists: false, 
            error: tableError.message 
          };
          result.errors.push(`Error checking table ${table}: ${tableError.message}`);
          continue;
        }
        
        // Get recent records
        const { data: recentRecords, error: recordsError } = await supabase
          .from(table)
          .select('*')
          .order('created_at', { ascending: false })
          .limit(5);
          
        if (recordsError) {
          result.tables[table] = { 
            exists: true, 
            records: 0,
            error: recordsError.message 
          };
          result.errors.push(`Error getting records from ${table}: ${recordsError.message}`);
          continue;
        }
        
        // Store the results
        result.tables[table] = {
          exists: true,
          records: recentRecords ? recentRecords.length : 0,
          recent: recentRecords
        };
      } catch (error: any) {
        result.tables[table] = { 
          exists: false, 
          error: error.message 
        };
        result.errors.push(`Exception checking table ${table}: ${error.message}`);
      }
    }
    
    // Get environment variable status (redacted values)
    result.environment = {
      node_env: process.env.NODE_ENV,
      formsg_mode: process.env.FORMSG_MODE || 'production',
      has_formsg_secret_key: !!process.env.FORMSG_SECRET_KEY,
      has_admin_password: !!process.env.ADMIN_PASSWORD,
      has_supabase_url: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      has_supabase_anon_key: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      has_service_role_key: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    };
    
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 });
  }
} 