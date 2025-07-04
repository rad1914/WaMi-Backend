
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
  getSingleMessage,
  getOldestMessageDetails,
  upsertReaction,
  deleteReaction,
  runInTransaction,
} from './database.js';

dotenv.config();
const SESSIONS_DIR = process.env.SESSIONS_DIR || './auth_sessions';

export const messageStore = new LRUCache({ max: 5000 });

const isGroup = jid => jid.endsWith('@g.us');
const getText = m => m?.conversation || m?.extendedTextMessage?.text || m?.caption || m?.reactionMessage?.text;
const getType = m => [
  'reaction', 'sticker', 'image', 'video', 'audio', 'document',
  'location', 'contact', 'extendedText', 'conversation'
].find(type => m?.[`${type}Message`] || (type === 'conversation' && m?.conversation));

function extractMediaDetails(content, key, type) {
  let media_url = null, mimetype = null, media_sha256 = null;

  if (['image', 'video', 'audio', 'document', 'sticker'].includes(type)) {
    mimetype = content.mimetype;
    media_url = content.url ? `/media/${key.id}` : null;
    media_sha256 = content.fileSha256 ? content.fileSha256.toString('hex') : null;

    if (!media_url) {
      logger.warn(`Media message ${key.id} is missing a URL. Type: ${type}`);
      mimetype = null;
      media_sha256 = null;
    }
  }

  return { media_url, mimetype, media_sha256 };
}

async function processMessages(session, messages, isHistorical = false) {
  const messageInserts = [];
  const chatMap = new Map();

  for (const m of messages) {
    try {
      if (!m?.message || !m?.key?.id) continue;
      const type = getType(m.message);
      if (type === 'reaction') continue;

      messageStore.set(m.key.id, m);

      const content = m.message[`${type}Message`] || m.message;
      const { media_url, mimetype, media_sha256 } = extractMediaDetails(content, m.key, type);

      const msg = {
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
        raw_message_data: JSON.stringify(m),
      };

      messageInserts.push(msg);

      if (!isHistorical) {
        const isGroupChat = isGroup(msg.jid);
        const name = isGroupChat
          ? session.sock.store?.chats?.[msg.jid]?.name || msg.jid.split('@')[0]
          : msg.sender_name || msg.jid.split('@')[0];

        const prev = chatMap.get(msg.jid) || { last_message_timestamp: 0, unread_count: 0 };
        const unread = prev.unread_count + (msg.isOutgoing ? 0 : 1);

        if (msg.timestamp >= prev.last_message_timestamp) {
          chatMap.set(msg.jid, {
            session_id: msg.session_id,
            jid: msg.jid,
            name,
            is_group: isGroupChat ? 1 : 0,
            last_message: msg.text || msg.type,
            last_message_timestamp: msg.timestamp,
            unread_count: unread,
          });
        } else {
          prev.unread_count = unread;
        }
      }
    } catch (err) {
      logger.error(`Failed to process message: ${err.message}`, err);
    }
  }

  if (messageInserts.length) {
    runInTransaction(() => {
      messageInserts.forEach(insertMessage.run);
      [...chatMap.values()].forEach(upsertChat.run);
    });

    if (!isHistorical) {
      session.io.emit('whatsapp-message', messageInserts.map(m => ({
        id: m.message_id,
        jid: m.jid,
        text: m.text,
        type: m.type,
        isOutgoing: m.isOutgoing,
        status: m.status,
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
  try {
    const { version } = await fetchLatestBaileysVersion();
    const authPath = path.join(SESSIONS_DIR, session.id);
    const { state, saveCreds } = await useMultiFileAuthState(authPath);

    const sock = makeWASocket({
      version,
      browser: Browsers.macOS('Desktop'),
      syncFullHistory: true,
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys) },
      emitOwnEvents: true,
      getMessage: async key => messageStore.get(key.id),
    });

    session.messageQueue = new PQueue({ concurrency: 1, interval: 1000, intervalCap: 2 });
    session.sock = sock;
    session.fetchMoreMessages = jid => fetchMoreMessages(session, jid);

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async ({ connection, qr: qrCode, lastDisconnect }) => {
      try {
if (qrCode) {
  logger.info(`[${session.id}] QR code received, generating data URL...`);
  const qrDataURL = await qr.toDataURL(qrCode);
  session.latestQR = qrDataURL;

  setTimeout(() => {
    session.io.emit('qr', qrDataURL);
    logger.info(`[${session.id}] QR code sent to client (after delay).`);
  }, 3000); // 3-second delay
}


        if (connection === 'open') {
          session.isAuthenticated = true;
          session.latestQR = null;
          logger.info(`[${session.id}] WhatsApp connection opened.`);
          session.io.emit('authenticated');
        }

        if (connection === 'close') {
          // MODIFICADO: Comprobar si el cierre fue por un reinicio del servidor
          if (session.isShuttingDown) {
            logger.info(`[${session.id}] Connection closed due to server shutdown. No action taken.`);
            return; // Salir para no borrar la sesión
          }
          
          session.isAuthenticated = false;
          const code = lastDisconnect?.error?.output?.statusCode;
          logger.warn(`[${session.id}] WhatsApp connection closed. Code: ${code}`);
          session.io.emit('disconnected');

          const isUnrecoverable = [
            DisconnectReason.loggedOut,
            DisconnectReason.connectionReplaced,
            DisconnectReason.badSession,
            DisconnectReason.invalidSession,
          ].includes(code);

          if (isUnrecoverable) {
            logger.info(`[${session.id}] Unrecoverable session error (Code: ${code}). Cleaning up session.`);
            onLogout();
          } else {
            logger.info(`[${session.id}] Retrying connection in 10 seconds...`);
            setTimeout(() => createWhatsappSession(session, onLogout), 10000);
          }
        }
      } catch (e) {
        logger.error(`[${session.id}] Error in connection.update handler:`, e);
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
            unread_count: c.unreadCount || 0,
          });
        }
      });
      await processMessages(session, messages, true);
    });

    sock.ev.on('messages.upsert', ({ messages }) => {
      processMessages(session, messages, false).catch(err =>
        logger.error(`Error in messages.upsert: ${err.message}`, err)
      );
    });

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

    sock.ev.on('chats.update', updates => {
      runInTransaction(() => {
        for (const update of updates) {
          if (update.id && update.name) {
            upsertChat.run({
              session_id: session.id,
              jid: update.id,
              name: update.name,
              is_group: isGroup(update.id) ? 1 : 0,
              last_message: null,
              last_message_timestamp: null,
              unread_count: null,
            });
          }
        }
      });
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
          updates.set(key.id, key.remoteJid);
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
  } catch (err) {
    logger.error(`Failed to create WhatsApp session: ${err.message}`, err);
  }
}