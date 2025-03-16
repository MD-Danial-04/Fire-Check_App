require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client with service role key for admin access
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function updateRLSPolicy() {
  try {
    console.log('Updating RLS policy for vehicle_configs table...');
    
    // SQL to drop existing policy and create a new one that allows public access
    const sql = `
      -- Drop existing policy if it exists
      DROP POLICY IF EXISTS vehicle_configs_policy ON vehicle_configs;
      
      -- Create new policy that allows all operations for all users (including anonymous)
      CREATE POLICY vehicle_configs_policy ON vehicle_configs
        FOR ALL
        USING (true)
        WITH CHECK (true);
    `;
    
    // Execute the SQL using pgmigrate RPC function
    const { error } = await supabase.rpc('pgmigrate', { query: sql });
    
    if (error) {
      console.error('Error updating RLS policy:', error);
      return;
    }
    
    console.log('RLS policy updated successfully. The vehicle_configs table is now publicly accessible.');
  } catch (error) {
    console.error('Error updating RLS policy:', error);
  }
}

updateRLSPolicy(); 