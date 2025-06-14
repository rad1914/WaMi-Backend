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
  downloadMediaMessage
} from '@whiskeysockets/baileys';
import qr from 'qrcode';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import {
  insertMessage,
  upsertChat,
  updateMessageStatus,
  getMessagesByJid
} from './database.js';

dotenv.config();
const SESSIONS_DIR = process.env.SESSIONS_DIR || './auth_sessions';
const MEDIA_DIR   = process.env.MEDIA_DIR   || './media';

export const normalizeJid = (input) => {
  if (!input) return null;
  try {
    const j = jidNormalizedUser(input);
    const { user, server } = jidDecode(j) || {};
    return user && server ? j : null;
  } catch {
    return null;
  }
};

const isGroup = jid => jid.endsWith('@g.us');
const getText = m => m?.conversation || m?.extendedTextMessage?.text || m?.caption;
const getType = m =>
  ['reaction', 'sticker', 'image', 'video', 'audio', 'document', 'location', 'contact', 'extendedText', 'conversation']
    .find(type => m?.[`${type}Message`] || (type === 'conversation' && m?.conversation));

export async function createWhatsappSession(session, onLogout) {
  const { version } = await fetchLatestBaileysVersion();
  const authPath = path.join(SESSIONS_DIR, session.id);
  const { state, saveCreds } = await useMultiFileAuthState(authPath);

  const sock = makeWASocket({
    version,
    browser: Browsers.macOS('Desktop'),
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys) },
    emitOwnEvents: true,
    getMessage: async key =>
      (await getMessagesByJid.get({ message_id: key.id, session_id: session.id }))?.message
  });

  session.sock = sock;
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async ({ connection, qr: qrCode, lastDisconnect }) => {
    if (qrCode) {
      session.latestQR = await qr.toDataURL(qrCode);
    }
    if (connection === 'open') {
      session.isAuthenticated = true;
      session.latestQR = null;
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

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const m of messages) {
      if (!m.message) continue;
      const type     = getType(m.message);
      const content  = m.message[`${type}Message`] || m.message;
      const text     = getText(m.message) || '';
      const ts       = Number(m.messageTimestamp) * 1000;
      const fromMe   = m.key.fromMe || false;
      const { id, remoteJid, participant } = m.key;
      const senderName = m.pushName || null;

      let media_url = null, mimetype = null;
      if (['image', 'video', 'audio', 'document', 'sticker'].includes(type)) {
        mimetype = content.mimetype;
        try {
          const buffer = await downloadMediaMessage(
            m, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage }
          );
          const ext  = mimetype?.split('/')[1]?.split(';')[0] || 'bin';
          const file = `${id}.${ext}`;
          const dir  = path.join(MEDIA_DIR, session.id);
          fs.mkdirSync(dir, { recursive: true });
          await fs.promises.writeFile(path.join(dir, file), buffer);
          media_url = `/media/${session.id}/${file}`;
        } catch { /* ignore download errors */ }
      }
      
      const quotedMessageId = content?.contextInfo?.stanzaId || null;
      const quotedMessageText = getText(content?.contextInfo?.quotedMessage) || null;

      // MODIFIED: Added 'type' to the database insert operation.
      insertMessage.run({
        message_id: id,
        session_id: session.id,
        jid: remoteJid,
        text,
        type, // ADDED
        isOutgoing: fromMe ? 1 : 0,
        status: fromMe ? 'sent' : 'received',
        timestamp: ts,
        participant: fromMe ? null : participant,
        sender_name: senderName,
        media_url,
        mimetype,
        quoted_message_id: quotedMessageId,
        quoted_message_text: quotedMessageText
      });

      upsertChat.run({
        session_id: session.id,
        jid: remoteJid,
        name: senderName || remoteJid.split('@')[0],
        is_group: isGroup(remoteJid) ? 1 : 0,
        last_message: text || type,
        last_message_timestamp: ts,
        increment_unread: fromMe ? 0 : 1
      });

      // MODIFIED: The socket payload now mirrors the full message structure.
      session.io.emit('whatsapp-message', [{
        id: id,
        jid: remoteJid,
        text: text,
        type: type, // ADDED
        isOutgoing: fromMe ? 1 : 0,
        status: fromMe ? 'sent' : 'received',
        timestamp: ts,
        name: senderName,
        media_url: media_url,
        mimetype: mimetype,
        quoted_message_id: quotedMessageId,
        quoted_message_text: quotedMessageText,
      }]);
    }
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
}
