// @path: message/message.controller.js
import * as service from './message.service.js'

const handler = fn => async (req, res) => {
  try {
    const result = await service[fn](req.body)
    res.status(200).json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export const send    = handler('sendMessage')
export const reply   = handler('replyToMessage')
export const forward = handler('forwardMessage')
export const react   = handler('reactToMessage')
export const remove  = handler('deleteMessage')
export const edit    = handler('editMessage')
