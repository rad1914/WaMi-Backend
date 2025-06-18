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
import crypto from 'crypto';
import dotenv from 'dotenv';
import PQueue from 'p-queue';
import { logger } from './logger.js';
import {
  insertMessage,
  upsertChat,
  updateMessageStatus,
  getChats,
  getMessagesByJid,
  getSingleMessage,
  getOldestMessageDetails,
  upsertReaction,
  deleteReaction,
  findMessageBySha256,
  runInTransaction,
} from './database.js';

dotenv.config();
const SESSIONS_DIR = process.env.SESSIONS_DIR || './auth_sessions';
const MEDIA_DIR = process.env.MEDIA_DIR || './media';

const isGroup = jid => jid.endsWith('@g.us');
const getText = m => m?.conversation || m?.extendedTextMessage?.text || m?.caption || m?.reactionMessage?.text;
const getType = m => [
  'reaction', 'sticker', 'image', 'video', 'audio', 'document',
  'location', 'contact', 'extendedText', 'conversation'
].find(type => m?.[`${type}Message`] || (type === 'conversation' && m?.conversation));

async function processMessages(session, messages, isHistorical = false) {
  const data = [];

  for (const m of messages) {
    if (!m.message || !m.key) continue;

    const type = getType(m.message);
    if (type === 'reaction') continue;

    const content = m.message[`${type}Message`] || m.message;
    let media_url = null, mimetype = null, media_sha256 = null;

    if (!isHistorical && ['image', 'video', 'audio', 'document', 'sticker'].includes(type)) {
      mimetype = content.mimetype;
      try {
        const buffer = await downloadMediaMessage(m, 'buffer', {}, { reuploadRequest: session.sock.updateMediaMessage });
        if (buffer) {
          media_sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
          const existing = findMessageBySha256.get({ media_sha256 });
          if (existing?.media_url) {
            media_url = existing.media_url;
            mimetype = existing.mimetype;
          } else {
            const ext = mimetype?.split('/')[1]?.split(';')[0] || 'bin';
            const dir = path.join(MEDIA_DIR, session.id);
            const file = path.join(dir, `${media_sha256}.${ext}`);
            await fs.promises.mkdir(dir, { recursive: true });
            await fs.promises.writeFile(file, buffer);
            media_url = `/media/${media_sha256}.${ext}`;
          }
        }
      } catch (e) {}
    }

    data.push({
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
    });
  }

  if (data.length) {
    runInTransaction(() => {
      for (const msg of data) {
        insertMessage.run(msg);
        if (!isHistorical) {
          const isGroupChat = isGroup(msg.jid);
          const name = isGroupChat
            ? (session.sock.chats[msg.jid]?.subject || msg.jid.split('@')[0])
            : msg.sender_name || msg.jid.split('@')[0];
          upsertChat.run({
            session_id: msg.session_id,
            jid: msg.jid,
            name,
            is_group: isGroupChat ? 1 : 0,
            last_message: msg.text || msg.type,
            last_message_timestamp: msg.timestamp,
            increment_unread: msg.isOutgoing ? 0 : 1
          });
        }
      }
    });

    if (!isHistorical) {
      session.io.emit('whatsapp-message', data.map(m => ({
        id: m.message_id,
        jid: m.jid,
        text: m.text,
        type: m.type,
        isOutgoing: !!m.isOutgoing,
        status: 'received',
        name: m.sender_name,
        media_url: m.media_url,
        quoted_message_id: m.quoted_message_id,
        quoted_message_text: m.quoted_message_text
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

async function runFullHistorySync(session) {
  const chats = getChats.all({ session_id: session.id });
  if (!chats?.length) return;

  const queue = new PQueue({ concurrency: 5 });
  for (const { jid } of chats) {
    queue.add(async () => {
      let fetched = 0, total = 0;
      do {
        fetched = await fetchMoreMessages(session, jid);
        total += fetched;
      } while (fetched > 0);
    });
  }
  await queue.onIdle();
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
    getMessage: async key => getMessagesByJid.get({ message_id: key.id, session_id: session.id })?.message,
  });

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
    await processMessages(session, messages, true);
    runFullHistorySync(session);
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
    for (const { key, reaction } of reactions) {
      if (!reaction?.senderJid) continue;
      if (reaction.text) {
        upsertReaction.run({ message_id: key.id, sender_jid: reaction.senderJid, emoji: reaction.text });
      } else {
        deleteReaction.run({ message_id: key.id, sender_jid: reaction.senderJid });
      }
    }

    const msgId = reactions[0]?.key?.id;
    const jid = reactions[0]?.key?.remoteJid;
    if (msgId && jid) {
      const message = getSingleMessage.get({ message_id: msgId });
      if (message) {
        const reactions = JSON.parse(message.reactions || '{}');
        session.io.emit('whatsapp-reaction-update', { id: msgId, jid, reactions });
      }
    }
  });
}
