// @path: chats/chats.service.js
export function getAllChats(sock) {
  const chats = sock.store?.chats || new Map();
  return Array.from(chats.values());
}

export function getPinnedChats(sock) {
  const chats = sock.store?.chats || new Map();
  return Array.from(chats.values()).filter(chat => chat.pinned);
}

export function getChatByJid(sock, jid) {
  const chat = sock.store?.chats?.get(jid);
  if (!chat) throw Object.assign(new Error('Chat not found'), { status: 404 });
  return chat;
}
