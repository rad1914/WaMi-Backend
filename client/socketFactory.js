// @path: client/socketFactory.js
import { makeWASocket, fetchLatestBaileysVersion, Browsers } from '@whiskeysockets/baileys';
import { registerSocketEvents } from '../utils/helpers.js';
import { store, saveStore } from './store.js';
import { io } from '../index.js';
import { sendPushNotification } from '../fcm/fcm.service.js';

let cachedVersion;
const getBaileysVersion = async () =>
  cachedVersion ||= (await fetchLatestBaileysVersion()).version;
export async function createSocket({ authState, sessionId, browserName, reinit }) {
  const sock = makeWASocket({
    version: await getBaileysVersion(),
    auth: authState,
    browser: Browsers.macOS(browserName),
    shouldSyncHistoryMessage: () => true,
    printQRInTerminal: false,
  });
  registerSocketEvents(sock, sessionId, authState.saveCreds, reinit);
  store.bind(sock.ev);

  sock.ev.on('messaging-history.set', ({ chats, messages, contacts }) => {
    chats.forEach(chat => store.chats.upsert(chat));
    messages.forEach(msg => store.messages.upsert(msg));
    contacts.forEach(contact => store.contacts.upsert(contact));
    saveStore(store);
  });
  ['creds.update', 'chats.set', 'chats.upsert', 'chats.update']
    .forEach(event => sock.ev.on(event, () => saveStore(store)));
  sock.ev.on('messages.upsert', ({ messages, type }) => {
    if (type === 'notify') {
      messages.forEach(msg => {
        io.emit('whatsapp-message', {
          sessionId,
          message: msg
        });
        if (msg.key.fromMe === false) {
          const messageBody = msg.message?.conversation || msg.message?.extendedTextMessage?.text || 'You received a new message.';
          const pushName = msg.pushName || 'A contact';
          const notificationPayload = {
              body: messageBody,
              pushName: pushName,
          };
          sendPushNotification(sessionId, notificationPayload);
        }
      });
    }
  });
  sock.ev.on('messages.update', updates => {
    io.emit('whatsapp-message-status', {
      sessionId,
      updates
    });
  });
  return sock;
}
