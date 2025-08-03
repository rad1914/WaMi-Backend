// @path: message/message.controller.js

import * as service from './message.service.js'
import { wrapController } from '../utils/helpers.js'

export const send    = wrapController(body => service.sendMessage(body))
export const reply   = wrapController(body => service.replyToMessage(body))
export const forward = wrapController(body => service.forwardMessage(body))
export const react   = wrapController(body => service.reactToMessage(body))
export const remove  = wrapController(body => service.deleteMessage(body))
export const edit    = wrapController(body => service.editMessage(body))
