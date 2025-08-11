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

export const getChatMessagesHandler = wrapController(async (params, req) => {
  const { jid } = params;
  if (!jid) {
    const err = new Error('jid is required');
    err.status = 400;
    throw err;
  }

  const messagesStore = req.sock.store?.messages ?? store.messages;
  const allMessages = messagesStore.all?.() ?? [];

  const chatMessages = allMessages.filter(m => m.key?.remoteJid === jid);

  return chatMessages;
}, { input: req => req.params });
