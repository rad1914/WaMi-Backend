// @path: message/message.controller.js
import * as service from './message.service.js';
import { wrapController } from '../utils/helpers.js';

export const send    = wrapController((body, req) => service.sendMessage(req.sock, body));
export const reply   = wrapController((body, req) => service.replyToMessage(req.sock, body));
export const forward = wrapController((body, req) => service.forwardMessage(req.sock, body));
export const react   = wrapController((body, req) => service.reactToMessage(req.sock, body));
export const remove  = wrapController((body, req) => service.deleteMessage(req.sock, body));
export const edit    = wrapController((body, req) => service.editMessage(req.sock, body));
