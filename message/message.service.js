import { getClient, initClient } from '../client/client.js'
import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
  makeCacheableSignalKeyStore,
  DisconnectReason,
  jidNormalizedUser,
  jidDecode,
} from '@whiskeysockets/baileys';
export const sendMessage = async ({ jid, type, content, options }) => {
  if (!jid || !type || !content) {
    throw new Error('jid, type and content are required.')
  }

  const messageContent = {}

  switch (type) {
    case 'text':
      messageContent.text = content
      break
    case 'image':
      messageContent.image = { url: content }
      break
    case 'video':
      messageContent.video = { url: content }
      break
    case 'audio':
      messageContent.audio = { url: content, mimetype: 'audio/ogg; codecs=opus' }
      break
    case 'document':
      messageContent.document = { url: content, mimetype: 'application/pdf', fileName: options?.fileName || 'file.pdf' }
      break
    case 'sticker':
      messageContent.sticker = { url: content }
      break
    default:
      throw new Error(`Unsupported message type: ${type}`)
  }

  return await clientSocket.sendMessage(jid, messageContent, options)
}

export const replyToMessage = async ({ jid, content, quotedMessageId, type = 'text' }) => {
  const quoted = await findMessage(jid, quotedMessageId)
  if (!quoted) throw new Error('Quoted message not found.')

  return await clientSocket.sendMessage(jid, { [type]: content }, { quoted })
}

export const forwardMessage = async ({ to, message }) => {
  if (!to || !message) throw new Error('to and message required.')
  return await clientSocket.relayMessage(to, message, { messageId: message.key?.id })
}

export const reactToMessage = async ({ jid, messageId, emoji }) => {
  const reactionMsg = {
    react: {
      text: emoji,
      key: {
        remoteJid: jid,
        id: messageId,
        fromMe: false
      }
    }
  }
  return await clientSocket.sendMessage(jid, reactionMsg)
}

export const deleteMessage = async ({ jid, messageId, fromMe = true }) => {
  return await clientSocket.sendMessage(jid, {
    delete: {
      remoteJid: jid,
      fromMe,
      id: messageId
    }
  })
}

export const editMessage = async ({ jid, messageId, newText }) => {
  const msgKey = {
    remoteJid: jid,
    fromMe: true,
    id: messageId
  }

  return await clientSocket.sendMessage(jid, {
    edit: {
      message: { conversation: newText },
      key: msgKey
    }
  })
}

// utility for quoted replies
const findMessage = async (jid, msgId) => {
  const messages = await clientSocket?.store?.loadMessages(jid, 50)
  return messages?.messages?.find((m) => m.key?.id === msgId)
}
