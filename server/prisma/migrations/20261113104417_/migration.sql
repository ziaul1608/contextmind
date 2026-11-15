-- Ensure tsvector column exists on memories
ALTER TABLE memories ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;

-- Ensure GIN index exists on memories
CREATE INDEX IF NOT EXISTS memories_search_vector_gin_idx
  ON memories USING GIN (search_vector);

-- Ensure tsvector column exists on messages
ALTER TABLE messages ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;

-- Ensure GIN index exists on messages
CREATE INDEX IF NOT EXISTS messages_search_vector_gin_idx
  ON messages USING GIN (search_vector);

