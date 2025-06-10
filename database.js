// database.js

import Database from 'better-sqlite3';

// Initialize the database in a file named 'chat.db'
const db = new Database(process.env.SQLITE_PATH || './chat.db');

// Create the 'messages' table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id TEXT UNIQUE,
    jid TEXT NOT NULL,
    text TEXT NOT NULL,
    isOutgoing INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'sent',
    timestamp INTEGER NOT NULL
  )
`);

// Create the 'chats' table to store a list of all conversations
db.exec(`
  CREATE TABLE IF NOT EXISTS chats (
    jid TEXT PRIMARY KEY NOT NULL,
    name TEXT,
    last_message TEXT,
    last_message_timestamp INTEGER
  )
`);

// --- Prepared Statements ---

const insertMessage = db.prepare(`
  INSERT OR IGNORE INTO messages
    (message_id, jid, text, isOutgoing, status, timestamp)
  VALUES
    (@message_id, @jid, @text, @isOutgoing, @status, @timestamp)
`);

const updateMessageStatus = db.prepare(`
  UPDATE messages SET status = @status WHERE message_id = @id
`);

const getMessagesByJid = db.prepare(`
  SELECT message_id, jid, text, isOutgoing, status, timestamp
    FROM messages
   WHERE jid = @jid
ORDER BY timestamp ASC
   LIMIT @limit
`);

// Insert or update a conversation entry in the 'chats' table
const upsertChat = db.prepare(`
    INSERT INTO chats (jid, name, last_message, last_message_timestamp)
    VALUES (@jid, @name, @last_message, @last_message_timestamp)
    ON CONFLICT(jid) DO UPDATE SET
        name = excluded.name,
        last_message = excluded.last_message,
        last_message_timestamp = excluded.last_message_timestamp
`);

// Get all conversations, ordered by the most recent message
const getChats = db.prepare(`
    SELECT jid, name, last_message, last_message_timestamp FROM chats
    ORDER BY last_message_timestamp DESC
`);

// Export all database functions
export {
    insertMessage,
    updateMessageStatus,
    getMessagesByJid,
    upsertChat,
    getChats
};
