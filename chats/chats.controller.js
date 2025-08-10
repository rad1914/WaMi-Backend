// @path: chats/chats.controller.js
import { wrapController } from '../utils/utils.js';
import { store } from '../client/store.js';

export const getChatsHandler = wrapController(async ({ jid }, req) => {
  const chats = req.sock.store?.chats ?? store.chats;

  if (jid) {
    const chat = chats.get(jid);
    if (!chat) {
      const err = new Error('Chat not found');
      err.status = 404;
      throw err;
    }
    return chat;
  }

  return chats.all?.() ?? [];
});

// get messages for a specific chat
export const getChatMessagesHandler = wrapController(async (params, req) => {
  const { jid } = params;
  if (!jid) {
    const err = new Error('jid is required');
    err.status = 400;
    throw err;
  }

  // use the session-bound store if available, otherwise fall back to the global store
  const messagesStore = req.sock.store?.messages ?? store.messages;
  const allMessages = messagesStore.all?.() ?? [];

  // filter messages by remoteJid (this is how messages are keyed in the store)
  const chatMessages = allMessages.filter(m => m.key?.remoteJid === jid);

  return chatMessages;
}, { input: req => req.params });
