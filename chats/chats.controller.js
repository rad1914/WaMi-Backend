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
