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

export const sendMessage = async (sock, { jid, type, content, options }) => {
  const payload = getPayload(type, content, options);
  return sock.sendMessage(jid, payload, options);
};

export const replyToMessage = async (sock, { jid, content, quotedMessageId, type = 'text' }) => {

  const messages = await sock.store?.loadMessages(jid, 50);
  const quoted = messages?.messages.find(m => m.key?.id === quotedMessageId);
  const payload = getPayload(type, content);
  return sock.sendMessage(jid, payload, { quoted });
};

export const forwardMessage = async (sock, { to, message }) => {
  return sock.relayMessage(to, message, { messageId: message.key?.id });
};

export const reactToMessage = async (sock, { jid, messageId, emoji }) => {
  const content = { text: emoji, key: { remoteJid: jid, id: messageId, fromMe: false } };
  return sock.sendMessage(jid, { react: content });
};

export const deleteMessage = async (sock, { jid, messageId, fromMe = true }) => {
  return sock.sendMessage(jid, { delete: { remoteJid: jid, fromMe, id: messageId } });
};

export const editMessage = async (sock, { jid, messageId, newText }) => {
  return sock.sendMessage(jid, {
    edit: {
      message: { conversation: newText },
      key: { remoteJid: jid, fromMe: true, id: messageId }
    }
  });
};
