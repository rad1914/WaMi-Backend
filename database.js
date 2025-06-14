// @path: database.js
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

// MODIFIED: Added sender_name to store the display name of the message sender.
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
    sender_name TEXT, -- ADDED
    media_url TEXT,
    mimetype TEXT,
    quoted_message_id TEXT,
    quoted_message_text TEXT
  )
`);

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

// MODIFIED: Updated to insert the new sender_name field.
const insertMessage = db.prepare(`
  INSERT OR IGNORE INTO messages
    (message_id, session_id, jid, text, isOutgoing, status, timestamp, participant, sender_name, media_url, mimetype, quoted_message_id, quoted_message_text)
  VALUES
    (@message_id, @session_id, @jid, @text, @isOutgoing, @status, @timestamp, @participant, @sender_name, @media_url, @mimetype, @quoted_message_id, @quoted_message_text)
`);

const updateMessageStatus = db.prepare(`
  UPDATE messages SET status = @status WHERE message_id = @id
`);

// MODIFIED: Selects sender_name and aliases it to 'name' for frontend compatibility.
const getMessagesByJid = db.prepare(`
  SELECT 
    message_id as id, jid, text, isOutgoing, status, timestamp, participant, 
    sender_name as name, -- MODIFIED
    media_url, mimetype, quoted_message_id, quoted_message_text
  FROM messages
  WHERE session_id = @session_id AND jid = @jid
  ORDER BY timestamp ASC
  LIMIT @limit
`);

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
