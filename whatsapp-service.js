// @path: whatsapp-service.js
import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
  makeCacheableSignalKeyStore,
  DisconnectReason,
  jidNormalizedUser,
  jidDecode,
} from '@whiskeysockets/baileys';
import qr from 'qrcode';
import path from 'path';
import dotenv from 'dotenv';
import PQueue from 'p-queue';
import { LRUCache } from 'lru-cache';
import { logger } from './logger.js';
import {
  insertMessage,
  upsertChat,
  updateMessageStatus,
  getChats,
  getSingleMessage,
  getOldestMessageDetails,
  upsertReaction,
  deleteReaction,
  runInTransaction,
} from './database.js';

dotenv.config();
const SESSIONS_DIR = process.env.SESSIONS_DIR || './auth_sessions';

const messageStore = new LRUCache({ max: 5000 });

const isGroup = jid => jid.endsWith('@g.us');
const getText = m => m?.conversation || m?.extendedTextMessage?.text || m?.caption || m?.reactionMessage?.text;
const getType = m => [
  'reaction', 'sticker', 'image', 'video', 'audio', 'document',
  'location', 'contact', 'extendedText', 'conversation'
].find(type => m?.[`${type}Message`] || (type === 'conversation' && m?.conversation));

async function processMessages(session, messages, isHistorical = false) {
  const messageInserts = [];
  const chatUpsertParams = new Map();

  for (const m of messages) {
    if (m.key?.id) {
        messageStore.set(m.key.id, m);
    }
    
    if (!m.message || !m.key) continue;

    const type = getType(m.message);
    if (type === 'reaction') continue;

    const content = m.message[`${type}Message`] || m.message;
    let media_url = null, mimetype = null, media_sha256 = null;

    if (['image', 'video', 'audio', 'document', 'sticker'].includes(type)) {
      mimetype = content.mimetype;
      media_url = content.url;
      media_sha256 = content.fileSha256 ? content.fileSha256.toString('hex') : null;

      if (!media_url) {
        logger.warn(`[${session.id}] Media message ${m.key.id} is missing a URL. Type: ${type}`);
        mimetype = null;
        media_sha256 = null;
      }
    }
    
    const msgData = {
      message_id: m.key.id,
      session_id: session.id,
      jid: m.key.remoteJid,
      text: getText(m.message) || '',
      type,
      isOutgoing: m.key.fromMe ? 1 : 0,
      status: m.key.fromMe ? 'read' : 'received',
      timestamp: Number(m.messageTimestamp) * 1000,
      participant: m.key.fromMe ? null : m.key.participant,
      sender_name: m.pushName || null,
      media_url,
      mimetype,
      quoted_message_id: content?.contextInfo?.stanzaId || content?.key?.id || null,
      quoted_message_text: getText(content?.contextInfo?.quotedMessage) || null,
      media_sha256,
    };
    messageInserts.push(msgData);
    
    if (!isHistorical) {
      const isGroupChat = isGroup(msgData.jid);
      const name = isGroupChat
        ? (session.sock.store?.chats[msgData.jid]?.name || msgData.jid.split('@')[0])
        : msgData.sender_name || msgData.jid.split('@')[0];

      const current = chatUpsertParams.get(msgData.jid) || { last_message_timestamp: 0, unread: 0 };
      const unreadIncrement = current.unread + (msgData.isOutgoing ? 0 : 1);

      if (msgData.timestamp >= current.last_message_timestamp) {
        chatUpsertParams.set(msgData.jid, {
          session_id: msgData.session_id,
          jid: msgData.jid,
          name,
          is_group: isGroupChat ? 1 : 0,
          last_message: msgData.text || msgData.type,
          last_message_timestamp: msgData.timestamp,
          increment_unread: unreadIncrement,
          unread: unreadIncrement,
        });
      } else {
         current.unread = unreadIncrement;
         current.increment_unread = unreadIncrement;
      }
    }
  }

  if (messageInserts.length) {
    runInTransaction(() => {
      for (const msg of messageInserts) {
        insertMessage.run(msg);
      }
      for (const chat of chatUpsertParams.values()) {
        upsertChat.run(chat);
      }
    });

    if (!isHistorical) {
      session.io.emit('whatsapp-message', messageInserts.map(m => ({
        id: m.message_id,
        jid: m.jid,
        text: m.text,
        type: m.type,
        isOutgoing: m.isOutgoing,
        status: 'received',
        timestamp: m.timestamp,
        name: m.sender_name,
        media_url: m.media_url,
        mimetype: m.mimetype,
        quoted_message_id: m.quoted_message_id,
        quoted_message_text: m.quoted_message_text,
        reactions: {},
      })));
    }
  }

  return messages.length;
}

export function normalizeJid(input) {
  try {
    const j = jidNormalizedUser(input);
    const { user, server } = jidDecode(j) || {};
    return user && server ? j : null;
  } catch {
    return null;
  }
}

export async function fetchMoreMessages(session, jid) {
  const normalizedJid = normalizeJid(jid);
  if (!normalizedJid) return 0;

  const oldest = getOldestMessageDetails.get({ session_id: session.id, jid: normalizedJid });
  if (!oldest) return 0;

  const key = { remoteJid: normalizedJid, id: oldest.message_id, fromMe: oldest.isOutgoing === 1 };
  if (!key.fromMe && isGroup(normalizedJid)) key.participant = oldest.participant;

  const messages = await session.sock.fetchMessageHistory(normalizedJid, 50, key);
  if (messages.length) await processMessages(session, messages, true);
  return messages.length;
}

export async function createWhatsappSession(session, onLogout) {
  const { version } = await fetchLatestBaileysVersion();
  const authPath = path.join(SESSIONS_DIR, session.id);
  const { state, saveCreds } = await useMultiFileAuthState(authPath);

  const sock = makeWASocket({
    version,
    browser: Browsers.macOS('Desktop'),
    syncFullHistory: true,
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys) },
    emitOwnEvents: true,
    getMessage: async (key) => {
      return messageStore.get(key.id);
    },
  });
  
  session.messageQueue = new PQueue({ concurrency: 1, interval: 1000, intervalCap: 2 });
  session.sock = sock;
  session.fetchMoreMessages = jid => fetchMoreMessages(session, jid);

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async ({ connection, qr: qrCode, lastDisconnect }) => {
    if (qrCode) session.latestQR = await qr.toDataURL(qrCode);
    if (connection === 'open') session.isAuthenticated = true;
    if (connection === 'close') {
      session.isAuthenticated = false;
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code !== DisconnectReason.loggedOut) {
        setTimeout(() => createWhatsappSession(session, onLogout), 3000);
      } else {
        onLogout(session.id);
      }
    }
  });

  sock.ev.on('messaging-history.set', async ({ chats, messages }) => {
    runInTransaction(() => {
        for (const c of chats) {
            upsertChat.run({
                session_id: session.id,
                jid: c.id,
                name: c.name || null,
                is_group: isGroup(c.id) ? 1 : 0,
                last_message: null,
                last_message_timestamp: null,
                increment_unread: c.unreadCount || 0,
            });
        }
    });
    await processMessages(session, messages, true);
  });

  sock.ev.on('messages.upsert', ({ messages }) => processMessages(session, messages, false));

  sock.ev.on('messages.update', updates => {
    for (const { key, update } of updates) {
      if (!key.fromMe) continue;
      const status = { 4: 'delivered', 5: 'read' }[update?.status];
      if (status) {
        updateMessageStatus.run({ status, id: key.id });
        session.io.emit('whatsapp-message-status-update', { id: key.id, status });
      }
    }
  });

  sock.ev.on('messages.reaction', reactions => {
    const updates = new Map();

    runInTransaction(() => {
      for (const { key, reaction } of reactions) {
        if (!reaction?.senderJid) continue;
        if (reaction.text) {
          upsertReaction.run({ message_id: key.id, sender_jid: reaction.senderJid, emoji: reaction.text });
        } else {
          deleteReaction.run({ message_id: key.id, sender_jid: reaction.senderJid });
        }
        if (!updates.has(key.id)) {
          updates.set(key.id, key.remoteJid);
        }
      }
    });

    for (const [msgId, jid] of updates.entries()) {
      const message = getSingleMessage.get({ message_id: msgId });
      if (message) {
        const reactions = message.reactions ? JSON.parse(message.reactions) : {};
        session.io.emit('whatsapp-reaction-update', { id: msgId, jid, reactions });
      }
    }
  });
}
