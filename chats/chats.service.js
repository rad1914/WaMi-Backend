// @path: chats/chats.service.js
export function getAllChats(sock) {
  const chatsMap = sock.store?.chats || new Map();
  return [...chatsMap.values()];
}

export function getChatByJid(sock, jid) {
  const chatsMap = sock.store?.chats || new Map();
  const chat = chatsMap.get(jid);
  if (!chat) {
    const error = new Error('Chat not found');
    error.status = 404;
    throw error;
  }
  return chat;
}

export function getPinnedChats(sock) {
  const chats = sock.store?.chats || new Map();
  return Array.from(chats.values()).filter(chat => chat.pinned);
}
