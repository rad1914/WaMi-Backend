// @path: chats/chats.service.js
import { store, saveStore } from '../store/store.js';

export async function getAllChats(sock) {
  let chatMap = sock.store?.chats || store.chats;

  if (!(chatMap instanceof Map)) {
    console.warn('⚠️ chatMap no es un Map. Forzando nuevo Map');
    chatMap = new Map();
    sock.store.chats = chatMap;
  }

  if (chatMap.size === 0) {
    const fetched = await sock.fetchChats();
    fetched.forEach(chat => chatMap.set(chat.id, chat));
    saveStore(store);
  }

  return [...chatMap.values()];
}

export async function getChatByJid(sock, jid) {
  const chatMap = sock.store?.chats || store.chats;

  if (chatMap.size === 0) {
    const fetched = await sock.fetchChats();
    fetched.forEach(chat => chatMap.set(chat.id, chat));
    saveStore(store);
  }

  const chat = chatMap.get(jid);
  if (!chat) {
    const error = new Error('Chat not found');
    error.status = 404;
    throw error;
  }
  return chat;
}

export async function getPinnedChats(sock) {
  const chatMap = sock.store?.chats || store.chats;

  if (chatMap.size === 0) {
    const fetched = await sock.fetchChats();
    fetched.forEach(chat => chatMap.set(chat.id, chat));
    saveStore(store);
  }

  return [...chatMap.values()].filter(chat => chat.pinned);
}
