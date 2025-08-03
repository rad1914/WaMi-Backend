// @path: message/message.service.js
import { getClient } from '../client/client.js'

const send = async (jid, content, options) => {
  const client = getClient()
  return await client.sendMessage(jid, content, options)
}

export const sendMessage = async ({ jid, type, content, options }) => {
  if (!jid || !type || !content) throw new Error('jid, type and content are required.')
  const payload = {
    text: { text: content },
    image: { image: { url: content } },
    video: { video: { url: content } },
    audio: { audio: { url: content, mimetype: 'audio/ogg; codecs=opus' } },
    document: { document: { url: content, mimetype: 'application/pdf', fileName: options?.fileName || 'file.pdf' } },
    sticker: { sticker: { url: content } }
  }[type]

  if (!payload) throw new Error(`Unsupported type: ${type}`)
  return await send(jid, payload, options)
}

export const replyToMessage = async ({ jid, content, quotedMessageId, type = 'text' }) => {
  const quoted = await findMessage(jid, quotedMessageId)
  if (!quoted) throw new Error('Quoted message not found.')
  return await send(jid, { [type]: content }, { quoted })
}

export const forwardMessage = async ({ to, message }) => {
  if (!to || !message) throw new Error('to and message required.')
  return await getClient().relayMessage(to, message, { messageId: message.key?.id })
}

export const reactToMessage = async ({ jid, messageId, emoji }) => {
  return await send(jid, {
    react: {
      text: emoji,
      key: { remoteJid: jid, id: messageId, fromMe: false }
    }
  })
}

export const deleteMessage = async ({ jid, messageId, fromMe = true }) => {
  return await send(jid, {
    delete: { remoteJid: jid, fromMe, id: messageId }
  })
}

export const editMessage = async ({ jid, messageId, newText }) => {
  return await send(jid, {
    edit: {
      message: { conversation: newText },
      key: { remoteJid: jid, fromMe: true, id: messageId }
    }
  })
}

const findMessage = async (jid, msgId) => {
  const client = getClient()
  const messages = await client.store?.loadMessages(jid, 50)
  return messages?.messages?.find(m => m.key?.id === msgId)
}
