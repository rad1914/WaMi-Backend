// @path: message/message.service.js
const getPayload = (type, content, options) => ({
  text:     { text: content },
  image:    { image: { url: content } },
  video:    { video: { url: content } },
  audio:    { audio: { url: content, mimetype: 'audio/ogg; codecs=opus' } },
  document: { document: { url: content, mimetype: 'application/pdf', fileName: options?.fileName || 'file.pdf' } },
  sticker:  { sticker: { url: content } },
  react:    { react: content },
  delete:   { delete: content },
  edit:     { edit: content }
}[type]);

export const sendMessage = (sock, { jid, type, content, options }) =>
  sock.sendMessage(jid, getPayload(type, content, options), options);

export const replyToMessage = async (sock, { jid, content, quotedMessageId, type = 'text' }) => {
  const quoted = (await sock.store?.loadMessages(jid, 50))?.messages.find(m => m.key?.id === quotedMessageId);
  return sock.sendMessage(jid, getPayload(type, content), { quoted });
};

export const forwardMessage = (sock, { to, message }) =>
  sock.relayMessage(to, message, { messageId: message.key?.id });

export const reactToMessage = (sock, { jid, messageId, emoji }) =>
  sock.sendMessage(jid, { react: { text: emoji, key: { remoteJid: jid, id: messageId, fromMe: false } } });

export const deleteMessage = (sock, { jid, messageId, fromMe = true }) =>
  sock.sendMessage(jid, { delete: { remoteJid: jid, id: messageId, fromMe } });

export const editMessage = (sock, { jid, messageId, newText }) =>
  sock.sendMessage(jid, { edit: { message: { conversation: newText }, key: { remoteJid: jid, id: messageId, fromMe: true } } });
