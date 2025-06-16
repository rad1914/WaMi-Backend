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
  downloadMediaMessage,
} from '@whiskeysockets/baileys';
import qr from 'qrcode';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import PQueue from 'p-queue';
import { logger } from './logger.js';
// ++ Applied suggestion: Import new database functions for reactions.
import {
  insertMessage,
  upsertChat,
  updateMessageStatus,
  getMessagesByJid,
  getSingleMessage,
  getOldestMessageDetails,
  upsertReaction,
  deleteReaction,
  runInTransaction,
} from './database.js';

dotenv.config();
const SESSIONS_DIR = process.env.SESSIONS_DIR || './auth_sessions';
const MEDIA_DIR   = process.env.MEDIA_DIR   || './media';

const isGroup = jid => jid.endsWith('@g.us');
const getText = m => m?.conversation || m?.extendedTextMessage?.text || m?.caption || m?.reactionMessage?.text;
const getType = m =>
  ['reaction', 'sticker', 'image', 'video', 'audio', 'document', 'location', 'contact', 'extendedText', 'conversation']
    .find(type => m?.[`${type}Message`] || (type === 'conversation' && m?.conversation));

async function processMessages(session, messages, isHistorical = false) {
  const processBatch = () => {
    for (const m of messages) {
      if (!m.message) continue;

      const remoteJid = m.key.remoteJid;
      const type = getType(m.message);

      // Reactions are handled by a separate event listener, so we skip them here.
      if (type === 'reaction') continue;
      
      const content = m.message[`${type}Message`] || m.message;
      const text = getText(m.message) || '';
      const ts = Number(m.messageTimestamp) * 1000;
      const fromMe = m.key.fromMe || false;
      const { id, participant } = m.key;
      const senderName = m.pushName || null;
      let media_url = null, mimetype = null;

      const shouldDownloadMedia = !isHistorical;
      if (shouldDownloadMedia && ['image', 'video', 'audio', 'document', 'sticker'].includes(type)) {
        mimetype = content.mimetype;
        try {
          const buffer = downloadMediaMessage(
            m, 'buffer', {}, { reuploadRequest: session.sock.updateMediaMessage }
          ).catch(e => logger.warn(`[${session.id}] Failed to download media for message ${id}:`, e));
          
          if(buffer) {
            const ext = mimetype?.split('/')[1]?.split(';')[0] || 'bin';
            const file = `${id}.${ext}`;
            const dir = path.join(MEDIA_DIR, session.id);
            fs.mkdirSync(dir, { recursive: true });
            fs.promises.writeFile(path.join(dir, file), buffer);
            media_url = `/media/${session.id}/${file}`;
          }
        } catch (e) {
            logger.warn(`[${session.id}] Media download/save failed for message ${id}:`, e);
        }
      }

      const quotedMessageId = content?.contextInfo?.stanzaId || content?.key?.id || null;
      const quotedMessageText = getText(content?.contextInfo?.quotedMessage) || null;

      insertMessage.run({
        message_id: id, session_id: session.id, jid: remoteJid, text, type,
        isOutgoing: fromMe ? 1 : 0, status: fromMe ? 'read' : 'received',
        timestamp: ts, participant: fromMe ? null : participant, sender_name: senderName,
        media_url, mimetype, quoted_message_id: quotedMessageId, quoted_message_text: quotedMessageText
      });

      if (!isHistorical) {
        const isGroupChat = isGroup(remoteJid);
        let chatName = senderName;
        if (isGroupChat) {
          const groupMeta = session.sock.chats[remoteJid] || {};
          chatName = groupMeta.subject || remoteJid.split('@')[0];
        }
        upsertChat.run({
          session_id: session.id, jid: remoteJid, name: chatName || remoteJid.split('@')[0],
          is_group: isGroupChat ? 1 : 0, last_message: text || type,
          last_message_timestamp: ts, increment_unread: fromMe ? 0 : 1
        });
        session.io.emit('whatsapp-message', [{
          id, jid: remoteJid, text, type, isOutgoing: fromMe, status: 'received', name: senderName,
          media_url, quoted_message_id: quotedMessageId, quoted_message_text: quotedMessageText,
        }]);
      }
    }
  };
  
  try {
      if (messages.length > 0) {
          runInTransaction(processBatch);
      }
  } catch (e) {
      logger.error(`[${session.id}] Failed to process message batch in transaction:`, e);
  }

  return messages.length;
}

export async function fetchMoreMessages(session, jid) {
  const normalizedJid = normalizeJid(jid);
  if (!normalizedJid) return 0;

  const oldest = getOldestMessageDetails.get({ session_id: session.id, jid: normalizedJid });
  if (!oldest) {
    logger.warn(`[${session.id}] No message cursor found for ${normalizedJid}, skipping fetch.`);
    return 0;
  }

  const key = { remoteJid: normalizedJid, id: oldest.message_id, fromMe: oldest.isOutgoing === 1 };
  if (!key.fromMe && isGroup(normalizedJid)) key.participant = oldest.participant;
  
  const messages = await session.sock.fetchMessageHistory(normalizedJid, 50, key);
  if (messages.length > 0) {
    logger.info(`[${session.id}] Fetched ${messages.length} older messages for ${normalizedJid}`);
    await processMessages(session, messages, true);
  }
  return messages.length;
}

async function runFullHistorySync(session) {
  logger.info(`[${session.id}] Preparing for full history sync...`);

  let attempts = 0;
  while ((!session.sock.chats || Object.keys(session.sock.chats).length === 0) && attempts < 15) {
      logger.info(`[${session.id}] Waiting for chat list... (attempt ${attempts + 1})`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      attempts++;
  }

  if (!session.sock.chats || Object.keys(session.sock.chats).length === 0) {
      logger.error(`[${session.id}] Chat list not available. Aborting full history sync.`);
      return;
  }

  const jids = Object.keys(session.sock.chats);
  logger.info(`[${session.id}] Starting history sync for ${jids.length} chats.`);
  
  const queue = new PQueue({ concurrency: 5 }); // Concurrently sync 5 chats at a time

  for (const jid of jids) {
    queue.add(async () => {
      let fetchedCount, totalFetched = 0;
      do {
        fetchedCount = await fetchMoreMessages(session, jid);
        totalFetched += fetchedCount;
      } while (fetchedCount > 0);
      if (totalFetched > 0) logger.info(`[${session.id}] Synced ${totalFetched} messages for ${jid}.`);
    });
  }

  await queue.onIdle();
  logger.info(`[${session.id}] Full history sync process completed for all chats.`);
}

export function normalizeJid(input) {
  if (!input) return null;
  try {
    const j = jidNormalizedUser(input);
    const { user, server } = jidDecode(j) || {};
    return user && server ? j : null;
  } catch { return null; }
};

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
    getMessage: async key => (await getMessagesByJid.get({ message_id: key.id, session_id: session.id }))?.message
  });

  session.sock = sock;
  session.fetchMoreMessages = (jid) => fetchMoreMessages(session, jid);

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async ({ connection, qr: qrCode, lastDisconnect }) => {
    if (qrCode) session.latestQR = await qr.toDataURL(qrCode);
    if (connection === 'open') {
      session.isAuthenticated = true;
      session.latestQR = null;
      runFullHistorySync(session).catch(e => {
        logger.error(`[${session.id}] Full history sync failed: ${e.message}`);
        logger.error(e.stack);
      });
    }
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
    logger.info(`[${session.id}] Received ${messages.length} initial history messages.`);
    for (const chat of chats) {
      upsertChat.run({
        session_id: session.id, jid: chat.id, name: chat.name || null, is_group: isGroup(chat.id) ? 1 : 0,
        last_message: null, last_message_timestamp: null, increment_unread: chat.unreadCount || 0,
      });
    }
    await processMessages(session, messages, true);
    logger.info(`[${session.id}] Finished processing ${messages.length} initial history messages.`);
  });
  
  sock.ev.on('messages.upsert', async ({ messages }) => {
    await processMessages(session, messages, false);
  });

  sock.ev.on('messages.update', updates => {
    for (const { key, update } of updates) {
      if (!key.fromMe) continue;
      const status = { 4: 'delivered', 5: 'read' }[update?.status] || 'sent';
      if (status !== 'sent') {
        updateMessageStatus.run({ status, id: key.id });
        session.io.emit('whatsapp-message-status-update', { id: key.id, status });
      }
    }
  });

  // ++ Applied suggestion: Listen for reaction events to provide real-time updates.
  sock.ev.on('messages.reaction', async (reactions) => {
    let updatedMessageId = null;
    let jid = null;

    for (const { key, reaction } of reactions) {
        const message_id = key.id;
        const sender_jid = reaction.senderJid; // The JID of the user who reacted.
        const emoji = reaction.text;
        
        updatedMessageId = message_id;
        jid = key.remoteJid;

        if (emoji) {
            upsertReaction.run({ message_id, sender_jid, emoji });
        } else {
            // If the emoji is empty, the reaction was removed by that user.
            deleteReaction.run({ message_id, sender_jid });
        }
    }

    if (updatedMessageId && jid) {
      try {
        const message = getSingleMessage.get({ message_id: updatedMessageId });
        if (message) {
          const newReactions = JSON.parse(message.reactions || '{}');
          session.io.emit('whatsapp-reaction-update', { 
            id: updatedMessageId,
            jid: jid,
            reactions: newReactions 
          });
        }
      } catch (e) {
        logger.error(`[${session.id}] Failed to fetch/emit reaction update for ${updatedMessageId}:`, e);
      }
    }
  });
}
