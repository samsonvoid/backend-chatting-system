import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import pool from './db.js';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function initializeDatabase() {
  const dbUser = process.env.DB_USER || 'postgres';
  const dbPassword = process.env.DB_PASSWORD || 'samson';
  const dbHost = process.env.DB_HOST || 'localhost';
  const dbPort = parseInt(process.env.DB_PORT || '5432');
  const dbName = process.env.DB_NAME || 'svs_chat_db';

  if (!process.env.DATABASE_URL && !process.env.POSTGRESQL_ADDON_URI) {
    // 1. Verify/Create database by connecting to default 'postgres' database first
    const systemPool = new Pool({
      user: dbUser,
      password: dbPassword,
      host: dbHost,
      port: dbPort,
      database: 'postgres'
    });

    try {
      const checkDbResult = await systemPool.query(
        "SELECT 1 FROM pg_database WHERE datname = $1", 
        [dbName]
      );

      if (checkDbResult.rows.length === 0) {
        console.log(`Database '${dbName}' does not exist on cluster. Programmatically creating database...`);
        // PostgreSQL CREATE DATABASE cannot run inside a transaction block, so we execute it directly
        await systemPool.query(`CREATE DATABASE "${dbName}"`);
        console.log(`Database '${dbName}' created successfully!`);
      } else {
        console.log(`Database '${dbName}' verified successfully on PostgreSQL cluster.`);
      }
    } catch (error) {
      console.error('Error verifying/creating PostgreSQL database:', error);
    } finally {
      // Gracefully close system connection
      await systemPool.end();
    }
  } else {
    console.log('Managed database connection detected (DATABASE_URL/POSTGRESQL_ADDON_URI). Skipping programmatic database verification/creation.');
  }

  // 2. Load and seed schema on target database
  try {
    console.log(`Initializing database schema inside '${dbName}'...`);

    // A. Read schema.sql
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    // B. Execute schema creation (creates tables if they don't exist)
    await pool.query(schemaSql);
    console.log('Database tables verified/created successfully.');

    // C-MIGRATION. Safely add any new columns to the existing tables without wiping data
    // Uses ADD COLUMN IF NOT EXISTS — completely safe for existing rows
    try {
      const migrations = [
        "CREATE EXTENSION IF NOT EXISTS pg_trgm",
        "CREATE INDEX IF NOT EXISTS idx_messages_content_trgm ON messages USING gin (content gin_trgm_ops)",
        "CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages (conversation_id, created_at DESC)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(100)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS theme VARCHAR(20) DEFAULT 'light'",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS accent_color VARCHAR(20) DEFAULT '#004ad3'",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS font_size VARCHAR(20) DEFAULT 'medium'",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS new_messages_alert BOOLEAN DEFAULT true",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS mentions_only_alert BOOLEAN DEFAULT false",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS sound_effects_alert BOOLEAN DEFAULT true",
        "ALTER TABLE conversation_users ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'user'",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT false",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS allow_group_creation BOOLEAN DEFAULT true",
        "ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT false",
        "ALTER TABLE users ALTER COLUMN avatar TYPE TEXT",
        "ALTER TABLE conversations ALTER COLUMN group_avatar TYPE TEXT",
      ];
      for (const sql of migrations) {
        await pool.query(sql);
      }
      console.log('✅ Column migrations applied successfully (new columns ensured).');
    } catch (migErr) {
      console.warn('⚠️ Column migration warning (non-fatal):', migErr.message);
    }

    // Reset user statuses on startup to offline (except keeping u3/Baraka as 'away' for variety)
    await pool.query("UPDATE users SET status = 'offline' WHERE id != 'u3'");
    await pool.query("UPDATE users SET status = 'away' WHERE id = 'u3'");
    await pool.query("UPDATE users SET role = 'admin' WHERE email = 'samsonprogrammer@gmail.com'");
    console.log('🧹 Cleaned up user presence statuses and admin roles on server boot.');

    // C. Check if mock users are already seeded (by checking if 'u1' exists)
    const { rows: mockCheck } = await pool.query("SELECT 1 FROM users WHERE id = 'u1'");
    if (mockCheck.length > 0) {
      console.log('Database already has seeded data. Skipping seed.');
      return;
    }

    console.log('Database is empty. Seeding initial mock data...');

    // D. Seed Users
    const defaultPasswordHash = await bcrypt.hash('password123', 10);
    const users = [
      { id: 'current', name: 'Samson Admin', email: 'samsonprogrammer@gmail.com', passwordHash: defaultPasswordHash, avatar: 'SA', status: 'online' },
      { id: 'u1', name: 'Jamali', email: 'jamali@collabhub.com', passwordHash: defaultPasswordHash, avatar: 'JM', status: 'offline' },
      { id: 'u2', name: 'Neema', email: 'neema@collabhub.com', passwordHash: defaultPasswordHash, avatar: 'NM', status: 'offline' },
      { id: 'u3', name: 'Baraka', email: 'baraka@collabhub.com', passwordHash: defaultPasswordHash, avatar: 'BK', status: 'away' },
      { id: 'u4', name: 'Amina', email: 'amina@collabhub.com', passwordHash: defaultPasswordHash, avatar: 'AM', status: 'offline' },
      { id: 'u5', name: 'Hassan', email: 'hassan@collabhub.com', passwordHash: defaultPasswordHash, avatar: 'HS', status: 'offline' },
      { id: 'u6', name: 'Fatuma', email: 'fatuma@collabhub.com', passwordHash: defaultPasswordHash, avatar: 'FT', status: 'offline' }
    ];

    for (const u of users) {
      await pool.query(
        'INSERT INTO users (id, name, email, password_hash, avatar, status) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING',
        [u.id, u.name, u.email, u.passwordHash, u.avatar, u.status]
      );
    }
    console.log('Users seeded successfully.');

    // E. Seed Conversations
    const chats = [
      { id: 'g1', type: 'group', name: 'SVS Info', avatar: 'SI', members: ['current', 'u1', 'u2', 'u5', 'u6'] },
      { id: 'g2', type: 'group', name: 'Frontend Team', avatar: 'FE', members: ['current', 'u2', 'u6'] },
      { id: 'g3', type: 'group', name: 'Backend Devs', avatar: 'BE', members: ['u1', 'u3', 'u5'] },
      { id: '1', type: 'direct', name: null, avatar: null, members: ['current', 'u1'] }, // Direct with Jamali
      { id: '2', type: 'direct', name: null, avatar: null, members: ['current', 'u2'] }, // Direct with Neema
      { id: '3', type: 'direct', name: null, avatar: null, members: ['current', 'u3'] }, // Direct with Baraka
      { id: '4', type: 'direct', name: null, avatar: null, members: ['current', 'u4'] }  // Direct with Amina
    ];

    for (const c of chats) {
      await pool.query(
        'INSERT INTO conversations (id, type, group_name, group_avatar) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING',
        [c.id, c.type, c.name, c.avatar]
      );

      for (const m of c.members) {
        await pool.query(
          'INSERT INTO conversation_users (conversation_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [c.id, m]
        );
      }
    }
    console.log('Conversations and participants seeded successfully.');

    // F. Seed Messages with JSONB Metadata
    const messages = [
      // SVS Info Group Messages
      { id: 'gm1', conversation_id: 'g1', sender_id: 'u2', content: 'Hey team, reminder that we have the sprint planning meeting at 2 PM today.', timestamp: new Date(Date.now() - 1800000), status: 'read' },
      { id: 'gm2', conversation_id: 'g1', sender_id: 'current', content: "Thanks for the reminder! I'll prepare the backlog items.", timestamp: new Date(Date.now() - 1700000), status: 'read' },
      { id: 'gm3', conversation_id: 'g1', sender_id: 'u5', content: 'Also, the staging environment is ready for testing the new features.', timestamp: new Date(Date.now() - 900000), status: 'read' },
      { id: 'gm4', conversation_id: 'g1', sender_id: 'u6', content: "Perfect timing! I'll start the QA tests this afternoon.", timestamp: new Date(Date.now() - 600000), status: 'read' },
      { id: 'gm5', conversation_id: 'g1', sender_id: 'u5', content: 'Server deployment completed successfully!', timestamp: new Date(Date.now() - 300000), status: 'sent' },

      // Frontend Group Messages
      { id: 'fm1', conversation_id: 'g2', sender_id: 'current', content: "I've updated the design system documentation. Check it out when you have time.", timestamp: new Date(Date.now() - 10800000), status: 'read' },
      { id: 'fm2', conversation_id: 'g2', sender_id: 'u2', content: 'Great work! The Tailwind config looks clean.', timestamp: new Date(Date.now() - 9000000), status: 'read' },
      { id: 'fm3', conversation_id: 'g2', sender_id: 'u6', content: 'The new component library looks amazing!', timestamp: new Date(Date.now() - 7200000), status: 'read' },

      // Backend Group Messages
      { id: 'bm1', conversation_id: 'g3', sender_id: 'u1', content: 'We need to optimize the database queries for the user dashboard.', timestamp: new Date(Date.now() - 21600000), status: 'read' },
      { id: 'bm2', conversation_id: 'g3', sender_id: 'u5', content: 'I can add some indexes to improve performance. Let me check the slow query log.', timestamp: new Date(Date.now() - 18000000), status: 'read' },
      { id: 'bm3', conversation_id: 'g3', sender_id: 'u3', content: 'Redis caching is working perfectly now.', timestamp: new Date(Date.now() - 14400000), status: 'read' },

      // Direct Jamali
      { id: 'm1', conversation_id: '1', sender_id: 'u1', content: 'Hey Kulwa, how is the project coming along?', timestamp: new Date(Date.now() - 3600000), status: 'read' },
      { id: 'm2', conversation_id: '1', sender_id: 'current', content: 'Going well! Just finishing up the authentication module.', timestamp: new Date(Date.now() - 3500000), status: 'read' },
      { id: 'm3', conversation_id: '1', sender_id: 'u1', content: 'Great! Do you need any help with the Socket.io integration?', timestamp: new Date(Date.now() - 3400000), status: 'read' },
      { id: 'm4', conversation_id: '1', sender_id: 'current', content: 'Actually yes, I could use some guidance on the Redis pub/sub setup.', timestamp: new Date(Date.now() - 120000), status: 'delivered' },
      { id: 'm5', conversation_id: '1', sender_id: 'u1', content: 'Sounds good! Let me know when you are ready.', timestamp: new Date(Date.now() - 19000), status: 'sent' },

      // Direct Neema
      { id: 'm6', conversation_id: '2', sender_id: 'u2', content: 'Morning! Did you push the latest changes?', timestamp: new Date(Date.now() - 7200000), status: 'read' },
      { id: 'm7', conversation_id: '2', sender_id: 'current', content: 'Yes, just pushed to the dev branch.', timestamp: new Date(Date.now() - 7100000), status: 'read' },
      { id: 'm8', conversation_id: '2', sender_id: 'u2', content: 'Perfect! See you at the standup.', timestamp: new Date(Date.now() - 7000000), status: 'read' },

      // Direct Baraka
      { id: 'm9', conversation_id: '3', sender_id: 'current', content: 'Hey, can you review my PR when you get a chance?', timestamp: new Date(Date.now() - 18000000), status: 'read' },
      { id: 'm10', conversation_id: '3', sender_id: 'u3', content: 'Let me check and get back to you.', timestamp: new Date(Date.now() - 17900000), status: 'read' },

      // Direct Amina
      { id: 'm11', conversation_id: '4', sender_id: 'current', content: 'I updated the database schema as we discussed.', timestamp: new Date(Date.now() - 86400000), status: 'read' },
      { id: 'm12', conversation_id: '4', sender_id: 'u4', content: 'Thanks for the update!', timestamp: new Date(Date.now() - 86300000), status: 'read' }
    ];

    for (const msg of messages) {
      await pool.query(
        `INSERT INTO messages (id, conversation_id, sender_id, content, metadata, created_at) 
         VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING`,
        [
          msg.id,
          msg.conversation_id,
          msg.sender_id,
          msg.content,
          JSON.stringify({ status: msg.status, attachments: [] }),
          msg.timestamp
        ]
      );
    }
    console.log('Messages with JSONB metadata seeded successfully!');
    console.log('PostgreSQL database initialization complete.');

  } catch (error) {
    console.error('Error initializing/seeding database:', error);
  }
}
