// @path: chats/chats.service.js
import { store, saveStore } from '../store/store.js';

export async function getAllChats(sock) {

  const all = sock.store?.chats?.all?.() ?? store.chats.all?.();
  return all || [];
}

export async function getChatByJid(sock, jid) {
  const chatMap = sock.store?.chats ?? store.chats;
  const chat = chatMap.get(jid);
  if (!chat) {
    const error = new Error('Chat not found');
    error.status = 404;
    throw error;
  }
  return chat;
}
