import {
  sendMessage,
  replyToMessage,
  forwardMessage,
  reactToMessage,
  deleteMessage,
  editMessage
} from './message.service.js'

export const send = async (req, res) => {
  try {
    const response = await sendMessage(req.body)
    res.status(200).json(response)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export const reply = async (req, res) => {
  try {
    const response = await replyToMessage(req.body)
    res.status(200).json(response)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export const forward = async (req, res) => {
  try {
    const response = await forwardMessage(req.body)
    res.status(200).json(response)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export const react = async (req, res) => {
  try {
    const response = await reactToMessage(req.body)
    res.status(200).json(response)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export const remove = async (req, res) => {
  try {
    const response = await deleteMessage(req.body)
    res.status(200).json(response)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export const edit = async (req, res) => {
  try {
    const response = await editMessage(req.body)
    res.status(200).json(response)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
