// @path: database.js
import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import { logger } from './logger.js';

dotenv.config();

const db = new Database(process.env.SQLITE_PATH || './chat.db');

try {
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
      quoted_message_text TEXT,
      media_sha256 TEXT,
      raw_message_data TEXT
    );
    
    CREATE INDEX IF NOT EXISTS idx_media_sha256 ON messages (media_sha256);
    CREATE INDEX IF NOT EXISTS idx_message_timestamp ON messages (timestamp);

    CREATE TABLE IF NOT EXISTS chats (
      session_id TEXT NOT NULL,
      jid TEXT NOT NULL,
      name TEXT,
      is_group INTEGER NOT NULL DEFAULT 0,
      last_message TEXT,
      last_message_timestamp INTEGER,
      unread_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (session_id, jid)
    );

    CREATE TABLE IF NOT EXISTS reactions (
      message_id TEXT NOT NULL,
      sender_jid TEXT NOT NULL,
      emoji TEXT NOT NULL,
      PRIMARY KEY (message_id, sender_jid)
    );
  `);
} catch (err) {
  logger.error('Database initialization failed:', err);
  throw err;
}

try {
  db.prepare(`SELECT raw_message_data FROM messages LIMIT 1`).get();
} catch (e) {
  if (e.message.includes('no such column')) {
    logger.warn('Missing `raw_message_data` column. Applying migration...');
    db.exec(`ALTER TABLE messages ADD COLUMN raw_message_data TEXT`);
    logger.info('Migration applied.');
  }
}

const insertMessage = db.prepare(`
  INSERT OR IGNORE INTO messages (
    message_id, session_id, jid, text, type, isOutgoing, status, timestamp,
    participant, sender_name, media_url, mimetype,
    quoted_message_id, quoted_message_text, media_sha256, raw_message_data
  ) VALUES (
    @message_id, @session_id, @jid, @text, @type, @isOutgoing, @status, @timestamp,
    @participant, @sender_name, @media_url, @mimetype,
    @quoted_message_id, @quoted_message_text, @media_sha256, @raw_message_data
  )
`);

const updateMessageStatus = db.prepare(`
  UPDATE messages SET status = @status WHERE message_id = @id
`);

const getMessagesByJid = db.prepare(`
  SELECT 
    m.message_id as id, m.jid, m.text, m.type, m.isOutgoing, m.status, m.timestamp, m.participant, 
    m.sender_name as name, 
    m.media_url, m.mimetype, m.quoted_message_id, m.quoted_message_text,
    m.media_sha256
  FROM messages m
  WHERE m.session_id = @session_id AND m.jid = @jid
  ORDER BY m.timestamp DESC
  LIMIT @limit
`);

const getReactionsForMessages = db.prepare(`
  SELECT 
    message_id,
    sender_jid,
    emoji
  FROM reactions
  WHERE message_id IN (SELECT value FROM json_each(?))
`);

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

const getMessageById = db.prepare(`
  SELECT raw_message_data FROM messages
  WHERE message_id = @message_id AND session_id = @session_id
  LIMIT 1
`);

const getOldestMessageDetails = db.prepare(`
  SELECT message_id, isOutgoing, participant, timestamp
  FROM messages
  WHERE session_id = @session_id AND jid = @jid
  ORDER BY timestamp ASC
  LIMIT 1
`);

const getMessageKeyDetails = db.prepare(`
  SELECT isOutgoing FROM messages
  WHERE message_id = @message_id AND session_id = @session_id
  LIMIT 1
`);

const findMessageBySha256 = db.prepare(`
  SELECT media_url, mimetype FROM messages
  WHERE media_sha256 = @media_sha256 AND media_url IS NOT NULL
  LIMIT 1
`);

const deleteOldMessages = db.prepare(`
  DELETE FROM messages WHERE timestamp < @cutoffTimestamp
`);

const deleteOldReactions = db.prepare(`
  DELETE FROM reactions
  WHERE NOT EXISTS (
    SELECT 1 FROM messages
    WHERE messages.message_id = reactions.message_id
  )
`);

const deleteSessionData = db.transaction((sessionId) => {
  const stmts = [
    db.prepare('DELETE FROM messages WHERE session_id = ?'),
    db.prepare('DELETE FROM chats WHERE session_id = ?'),
  ];
  for (const stmt of stmts) {
    stmt.run(sessionId);
  }
});

const upsertChat = db.prepare(`
  INSERT INTO chats (
    session_id, jid, name, is_group, last_message, last_message_timestamp, unread_count
  ) VALUES (
    @session_id, @jid, @name, @is_group, @last_message, @last_message_timestamp, @unread_count
  )
  ON CONFLICT(session_id, jid) DO UPDATE SET
    name = IIF(excluded.name IS NOT NULL, excluded.name, name),
    last_message = IIF(excluded.last_message IS NOT NULL, excluded.last_message, last_message),
    last_message_timestamp = IIF(excluded.last_message_timestamp IS NOT NULL, excluded.last_message_timestamp, last_message_timestamp),
    unread_count = IIF(excluded.unread_count IS NOT NULL, excluded.unread_count, unread_count)
`);

const getChats = db.prepare(`
  SELECT
    jid,
    name,
    is_group as isGroupInt,
    last_message,
    last_message_timestamp,
    unread_count as unreadCount
  FROM chats
  WHERE session_id = @session_id
  ORDER BY last_message_timestamp DESC
`);

const resetChatUnreadCount = db.prepare(`
  UPDATE chats SET unread_count = 0 WHERE session_id = @session_id AND jid = @jid
`);

const upsertReaction = db.prepare(`
  INSERT OR REPLACE INTO reactions (message_id, sender_jid, emoji)
  VALUES (@message_id, @sender_jid, @emoji)
`);

const deleteReaction = db.prepare(`
  DELETE FROM reactions WHERE message_id = @message_id AND sender_jid = @sender_jid
`);

const runInTransaction = (fn) => db.transaction(fn)();

export {
  db,
  runInTransaction,

  insertMessage,
  updateMessageStatus,
  getMessagesByJid,
  getReactionsForMessages,
  getSingleMessage,
  getMessageById,
  getOldestMessageDetails,
  getMessageKeyDetails,
  findMessageBySha256,
  deleteOldMessages,
  deleteSessionData,

  upsertChat,
  getChats,
  resetChatUnreadCount,

  upsertReaction,
  deleteReaction,
  deleteOldReactions
};
