-- Add tsvector column for full-text search on messages
ALTER TABLE messages ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;

-- Create GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS messages_search_vector_gin_idx
  ON messages USING GIN (search_vector);
