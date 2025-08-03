// @path: message/message.service.js
import { getSession } from '../client/session.manager.js'

const getPayload = (type, content, options) => {
  const payloads = {
    text:     { text: content },
    image:    { image: { url: content } },
    video:    { video: { url: content } },
    audio:    { audio: { url: content, mimetype: 'audio/ogg; codecs=opus' } },
    document: { document: { url: content, mimetype: 'application/pdf', fileName: options?.fileName || 'file.pdf' } },
    sticker:  { sticker: { url: content } },
    react:    { react: content },
    delete:   { delete: content },
    edit:     { edit: content }
  }
  return payloads[type]
}

export const sendMessage = async ({ sessionId, jid, type, content, options }) => {
  const sock = getSession(sessionId)
  const payload = getPayload(type, content, options)
  return await sock.sendMessage(jid, payload, options)
}

export const replyToMessage = async ({ sessionId, jid, content, quotedMessageId, type = 'text' }) => {
  const sock = getSession(sessionId)
  const quoted = await findMessage(sessionId, jid, quotedMessageId)
  const payload = getPayload(type, content)
  return await sock.sendMessage(jid, payload, { quoted })
}

export const forwardMessage = async ({ sessionId, to, message }) => {
  const sock = getSession(sessionId)
  return await sock.relayMessage(to, message, { messageId: message.key?.id })
}

export const reactToMessage = async ({ sessionId, jid, messageId, emoji }) => {
  const sock = getSession(sessionId)
  const content = { text: emoji, key: { remoteJid: jid, id: messageId, fromMe: false } }
  return await sock.sendMessage(jid, { react: content })
}

export const deleteMessage = async ({ sessionId, jid, messageId, fromMe = true }) => {
  const sock = getSession(sessionId)
  return await sock.sendMessage(jid, { delete: { remoteJid: jid, fromMe, id: messageId } })
}

export const editMessage = async ({ sessionId, jid, messageId, newText }) => {
  const sock = getSession(sessionId)
  return await sock.sendMessage(jid, {
    edit: { message: { conversation: newText }, key: { remoteJid: jid, fromMe: true, id: messageId } }
  })
}

const findMessage = async (sessionId, jid, msgId) => {
  const sock = getSession(sessionId)
  const messages = await sock.store?.loadMessages(jid, 50)
  return messages?.messages?.find(m => m.key?.id === msgId)
}
