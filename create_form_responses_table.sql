-- Create form_responses table if it doesn't exist
CREATE TABLE IF NOT EXISTS form_responses (
  id BIGSERIAL PRIMARY KEY,
  personnel_name TEXT NOT NULL,
  response_id TEXT NOT NULL,
  form_type TEXT NOT NULL, -- 'ppe_check', 'ppe_check_webhook', etc.
  submitted_at TIMESTAMPTZ NOT NULL,
  form_data JSONB -- Stores additional form data from webhook
);

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS form_responses_personnel_name_idx ON form_responses(personnel_name);
CREATE INDEX IF NOT EXISTS form_responses_response_id_idx ON form_responses(response_id);
CREATE INDEX IF NOT EXISTS form_responses_form_type_idx ON form_responses(form_type);
CREATE INDEX IF NOT EXISTS form_responses_submitted_at_idx ON form_responses(submitted_at DESC);

-- Set up row level security
ALTER TABLE form_responses ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to select all form responses
CREATE POLICY form_responses_select_policy
  ON form_responses
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to insert form responses
CREATE POLICY form_responses_insert_policy
  ON form_responses
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow authenticated users to update form responses
CREATE POLICY form_responses_update_policy
  ON form_responses
  FOR UPDATE
  TO authenticated
  USING (true);

-- Allow authenticated users to delete form responses
CREATE POLICY form_responses_delete_policy
  ON form_responses
  FOR DELETE
  TO authenticated
  USING (true); 