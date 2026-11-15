-- Add tsvector column for full-text search on memories
ALTER TABLE memories ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;

-- Create GIN index for fast full-text search on memories
CREATE INDEX IF NOT EXISTS memories_search_vector_gin_idx
  ON memories USING GIN (search_vector);

-- Create functional GIN index for full-text search on conversation summary and title
CREATE INDEX IF NOT EXISTS conversations_summary_title_gin_idx
  ON conversations USING GIN (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(summary, '')));