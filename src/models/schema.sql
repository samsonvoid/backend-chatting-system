-- Enable pgcrypto extension for UUID generation if needed (optional)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  username VARCHAR(100),
  email VARCHAR(255) UNIQUE,
  password_hash VARCHAR(255),
  avatar VARCHAR(255),
  status VARCHAR(20) DEFAULT 'offline',
  bio TEXT,
  theme VARCHAR(20) DEFAULT 'light',
  accent_color VARCHAR(20) DEFAULT '#004ad3',
  font_size VARCHAR(20) DEFAULT 'medium',
  new_messages_alert BOOLEAN DEFAULT true,
  mentions_only_alert BOOLEAN DEFAULT false,
  sound_effects_alert BOOLEAN DEFAULT true,
  role VARCHAR(20) DEFAULT 'user',
  is_blocked BOOLEAN DEFAULT false
);

-- 2. Conversations Table
CREATE TABLE IF NOT EXISTS conversations (
  id VARCHAR(255) PRIMARY KEY,
  type VARCHAR(20) DEFAULT 'direct', -- 'direct' or 'group'
  group_name VARCHAR(100) NULL,
  group_avatar VARCHAR(255) NULL
);

-- 3. Conversation Users Join Table (Many-to-Many relationship)
CREATE TABLE IF NOT EXISTS conversation_users (
  conversation_id VARCHAR(255) REFERENCES conversations(id) ON DELETE CASCADE,
  user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
  last_read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (conversation_id, user_id)
);

-- 4. Messages Table with Hybrid JSONB Columns
CREATE TABLE IF NOT EXISTS messages (
  id VARCHAR(255) PRIMARY KEY,
  conversation_id VARCHAR(255) REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}', -- Store status, attachments, read-receipts
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Create a Generalized Inverted Index (GIN) on the JSONB metadata field
CREATE INDEX IF NOT EXISTS idx_messages_metadata ON messages USING gin (metadata);

-- 6. Create GIN index on message content for trigram search optimization
CREATE INDEX IF NOT EXISTS idx_messages_content_trgm ON messages USING gin (content gin_trgm_ops);

