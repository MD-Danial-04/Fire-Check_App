-- Create webhook_logs table
CREATE TABLE IF NOT EXISTS webhook_logs (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  source_ip TEXT NOT NULL,
  status TEXT NOT NULL,
  error_message TEXT,
  headers JSONB NOT NULL,
  payload JSONB NOT NULL
);

-- Add index for faster lookup by status
CREATE INDEX IF NOT EXISTS webhook_logs_status_idx ON webhook_logs(status);

-- Add index for created_at for chronological queries
CREATE INDEX IF NOT EXISTS webhook_logs_created_at_idx ON webhook_logs(created_at DESC);

-- Comment on table
COMMENT ON TABLE webhook_logs IS 'Logs of incoming FormSG webhook requests';

-- Enable row level security
ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;

-- Create policy that allows all authenticated users to select webhook logs
CREATE POLICY webhook_logs_select_policy
  ON webhook_logs
  FOR SELECT
  TO authenticated
  USING (true);

-- Create policy that allows all authenticated users to insert webhook logs
CREATE POLICY webhook_logs_insert_policy
  ON webhook_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Create policy that allows all authenticated users to update webhook logs
CREATE POLICY webhook_logs_update_policy
  ON webhook_logs
  FOR UPDATE
  TO authenticated
  USING (true);

-- Create a view for the most recent webhook logs
CREATE OR REPLACE VIEW recent_webhook_logs AS
SELECT *
FROM webhook_logs
ORDER BY created_at DESC
LIMIT 100; 