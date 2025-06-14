// database.js (Endpoint) 
import Database from 'better-sqlite3';
import fs from 'fs';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const mediaDir = process.env.MEDIA_DIR || './media';
if (!fs.existsSync(mediaDir)) {
    fs.mkdirSync(mediaDir, { recursive: true });
}

const db = new Database(process.env.SQLITE_PATH || './chat.db');

// Add session_id, and fields for quoted messages
db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id TEXT UNIQUE,
    session_id TEXT NOT NULL,
    jid TEXT NOT NULL,
    text TEXT,
    isOutgoing INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'sent',
    timestamp INTEGER NOT NULL,
    participant TEXT,
    media_url TEXT,
    mimetype TEXT,
    -- Added fields for replies
    quoted_message_id TEXT,
    quoted_message_text TEXT
  )
`);

// Add session_id, unread_count, and make primary key composite
db.exec(`
  CREATE TABLE IF NOT EXISTS chats (
    session_id TEXT NOT NULL,
    jid TEXT NOT NULL,
    name TEXT,
    is_group INTEGER NOT NULL DEFAULT 0,
    last_message TEXT,
    last_message_timestamp INTEGER,
    unread_count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (session_id, jid)
  )
`);

// Updated to include quoted message fields
const insertMessage = db.prepare(`
  INSERT OR IGNORE INTO messages
    (message_id, session_id, jid, text, isOutgoing, status, timestamp, participant, media_url, mimetype, quoted_message_id, quoted_message_text)
  VALUES
    (@message_id, @session_id, @jid, @text, @isOutgoing, @status, @timestamp, @participant, @media_url, @mimetype, @quoted_message_id, @quoted_message_text)
`);

const updateMessageStatus = db.prepare(`
  UPDATE messages SET status = @status WHERE message_id = @id
`);

// ALIGNED: Aliased message_id as id to match frontend expectation directly.
const getMessagesByJid = db.prepare(`
  SELECT message_id as id, jid, text, isOutgoing, status, timestamp, participant, media_url, mimetype, quoted_message_id, quoted_message_text
    FROM messages
   WHERE session_id = @session_id AND jid = @jid
ORDER BY timestamp ASC
   LIMIT @limit
`);

// This is perfectly implemented for atomic updates. No changes needed.
const upsertChat = db.prepare(`
    INSERT INTO chats (session_id, jid, name, is_group, last_message, last_message_timestamp, unread_count)
    VALUES (@session_id, @jid, @name, @is_group, @last_message, @last_message_timestamp, @increment_unread)
    ON CONFLICT(session_id, jid) DO UPDATE SET
        name = COALESCE(excluded.name, name),
        last_message = excluded.last_message,
        last_message_timestamp = excluded.last_message_timestamp,
        unread_count = unread_count + excluded.unread_count
`);

const getChats = db.prepare(`
    SELECT jid, name, is_group, last_message, last_message_timestamp, unread_count as unreadCount FROM chats
    WHERE session_id = @session_id
    ORDER BY last_message_timestamp DESC
`);

const resetChatUnreadCount = db.prepare(`
    UPDATE chats SET unread_count = 0 WHERE session_id = @session_id AND jid = @jid
`);

export {
    db,
    insertMessage,
    updateMessageStatus,
    getMessagesByJid,
    upsertChat,
    getChats,
    resetChatUnreadCount
};
