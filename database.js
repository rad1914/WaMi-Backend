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

db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id TEXT UNIQUE,
    session_id TEXT NOT NULL,
    jid TEXT NOT NULL,
    text TEXT,
    type TEXT,
    isOutgoing INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'sent',
    timestamp INTEGER NOT NULL,
    participant TEXT,
    sender_name TEXT,
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

// ++ Applied suggestion: Added a dedicated table for reactions for scalability.
db.exec(`
  CREATE TABLE IF NOT EXISTS reactions (
    message_id TEXT NOT NULL,
    sender_jid TEXT NOT NULL,
    emoji TEXT NOT NULL,
    PRIMARY KEY (message_id, sender_jid)
  )
`);

const insertMessage = db.prepare(`
  INSERT OR IGNORE INTO messages
    (message_id, session_id, jid, text, type, isOutgoing, status, timestamp, participant, sender_name, media_url, mimetype, quoted_message_id, quoted_message_text)
  VALUES
    (@message_id, @session_id, @jid, @text, @type, @isOutgoing, @status, @timestamp, @participant, @sender_name, @media_url, @mimetype, @quoted_message_id, @quoted_message_text)
`);

const updateMessageStatus = db.prepare(`
  UPDATE messages SET status = @status WHERE message_id = @id
`);

// ++ Applied suggestion: The query now aggregates reactions into a JSON object.
const getMessagesByJid = db.prepare(`
  SELECT 
    m.message_id as id, m.jid, m.text, m.type, m.isOutgoing, m.status, m.timestamp, m.participant, 
    m.sender_name as name, 
    m.media_url, m.mimetype, m.quoted_message_id, m.quoted_message_text,
    (
      SELECT json_group_object(emoji, count)
      FROM (
        SELECT emoji, COUNT(*) as count
        FROM reactions r
        WHERE r.message_id = m.message_id
        GROUP BY emoji
      )
    ) as reactions
  FROM messages m
  WHERE m.session_id = @session_id AND m.jid = @jid
  ORDER BY m.timestamp DESC
  LIMIT @limit
`);

// ++ Applied suggestion: Added a query to get a single message's aggregated reactions.
const getSingleMessage = db.prepare(`
  SELECT 
    m.message_id as id,
    (
      SELECT json_group_object(emoji, count)
      FROM (
        SELECT emoji, COUNT(*) as count
        FROM reactions r
        WHERE r.message_id = m.message_id
        GROUP BY emoji
      )
    ) as reactions
  FROM messages m
  WHERE m.message_id = @message_id
`);


const getOldestMessageDetails = db.prepare(`
  SELECT message_id, isOutgoing, participant, timestamp FROM messages
  WHERE session_id = @session_id AND jid = @jid
  ORDER BY timestamp ASC
  LIMIT 1
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
    SELECT jid, name, is_group as isGroupInt, last_message, last_message_timestamp, unread_count as unreadCount FROM chats
    WHERE session_id = @session_id
    ORDER BY last_message_timestamp DESC
`);

const resetChatUnreadCount = db.prepare(`
    UPDATE chats SET unread_count = 0 WHERE session_id = @session_id AND jid = @jid
`);

// ++ Applied suggestion: Added statements for inserting/deleting specific reactions.
const upsertReaction = db.prepare(`
    INSERT OR REPLACE INTO reactions (message_id, sender_jid, emoji) VALUES (@message_id, @sender_jid, @emoji)
`);

const deleteReaction = db.prepare(`
    DELETE FROM reactions WHERE message_id = @message_id AND sender_jid = @sender_jid
`);

const runInTransaction = (fn) => {
    return db.transaction(fn)();
};

export {
    db,
    insertMessage,
    updateMessageStatus,
    getMessagesByJid,
    getSingleMessage,
    getOldestMessageDetails,
    upsertChat,
    getChats,
    resetChatUnreadCount,
    upsertReaction,
    deleteReaction,
    runInTransaction
};
