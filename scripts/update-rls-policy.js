// Load environment variables from .env.local file
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from .env.local
const envLocalPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envLocalPath)) {
  const envConfig = dotenv.parse(fs.readFileSync(envLocalPath));
  for (const k in envConfig) {
    process.env[k] = envConfig[k];
  }
  console.log('Loaded environment variables from .env.local');
} else {
  console.log('No .env.local file found, falling back to .env');
  dotenv.config();
}

const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client with service role key for admin access
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  console.error('Error: NEXT_PUBLIC_SUPABASE_URL is not defined in environment variables');
  process.exit(1);
}

if (!supabaseKey) {
  console.error('Error: Neither SUPABASE_SERVICE_ROLE_KEY nor NEXT_PUBLIC_SUPABASE_ANON_KEY is defined in environment variables');
  process.exit(1);
}

console.log(`Using Supabase URL: ${supabaseUrl}`);
const supabase = createClient(supabaseUrl, supabaseKey);

async function updateRLSPolicy() {
  try {
    console.log('Updating RLS policy for vehicle_configs table...');
    
    // SQL to drop existing policy if it exists
    const dropPolicySQL = `
      DROP POLICY IF EXISTS vehicle_configs_policy ON vehicle_configs;
    `;
    
    // SQL to create new policy that allows all operations for all users
    const createPolicySQL = `
      CREATE POLICY vehicle_configs_policy ON vehicle_configs
        FOR ALL
        USING (true)
        WITH CHECK (true);
    `;
    
    // Execute the SQL using pgmigrate RPC function
    console.log('Dropping existing policy...');
    const { error: dropError } = await supabase.rpc('pgmigrate', { query: dropPolicySQL });
    
    if (dropError) {
      console.error('Error dropping existing policy:', dropError);
      return;
    }
    
    console.log('Creating new policy...');
    const { error: createError } = await supabase.rpc('pgmigrate', { query: createPolicySQL });
    
    if (createError) {
      console.error('Error creating new policy:', createError);
      return;
    }
    
    console.log('RLS policy updated successfully. The vehicle_configs table is now publicly accessible.');
  } catch (error) {
    console.error('Error updating RLS policy:', error);
  }
}

updateRLSPolicy(); 