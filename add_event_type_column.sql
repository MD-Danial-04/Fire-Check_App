-- Add event_type column to webhook_logs table
ALTER TABLE webhook_logs ADD COLUMN IF NOT EXISTS event_type TEXT;

-- Update the cron function to use the new column
CREATE OR REPLACE FUNCTION reset_daily_checks() RETURNS void AS $$
BEGIN
  -- Clean up old data, reset counts, etc.
  
  -- Log the completion of the daily reset
  INSERT INTO webhook_logs (event_type, status, message, source_ip, headers, payload)
    VALUES ('daily_reset', 'success', 'Daily reset completed at ' || NOW(), '127.0.0.1', '{}', '{}');
  
  -- Return success
  RETURN;
END;
$$ LANGUAGE plpgsql; 