require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runMigration(filePath) {
  try {
    console.log(`Running migration: ${filePath}`);
    const sql = fs.readFileSync(filePath, 'utf8');
    
    // Split the SQL file into separate statements
    const statements = sql
      .split(';')
      .map(statement => statement.trim())
      .filter(statement => statement.length > 0);
    
    // Execute each statement
    for (const statement of statements) {
      const { error } = await supabase.rpc('pgmigrate', { query: statement });
      
      if (error) {
        console.error(`Error executing statement: ${statement}`);
        console.error(error);
        return false;
      }
    }
    
    console.log(`Migration completed successfully: ${filePath}`);
    return true;
  } catch (error) {
    console.error(`Error running migration ${filePath}:`, error);
    return false;
  }
}

async function runMigrations() {
  const migrationsDir = path.join(__dirname, '..', 'migrations');
  
  try {
    // Get all SQL files in the migrations directory
    const files = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .map(file => path.join(migrationsDir, file));
    
    if (files.length === 0) {
      console.log('No migration files found.');
      return;
    }
    
    console.log(`Found ${files.length} migration files.`);
    
    // Run migrations in sequence
    for (const file of files) {
      const success = await runMigration(file);
      if (!success) {
        console.error(`Migration failed: ${file}`);
        process.exit(1);
      }
    }
    
    console.log('All migrations completed successfully.');
  } catch (error) {
    console.error('Error running migrations:', error);
    process.exit(1);
  }
}

runMigrations(); 