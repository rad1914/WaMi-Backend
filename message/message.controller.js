// @path: message/message.controller.js
import * as svc from './message.service.js';
import { wrapController } from '../utils/controller.js';

export const send = wrapController((body, req) =>
  svc.sendMessage(req.sock, body)
);
export const reply = wrapController((body, req) =>
  svc.replyToMessage(req.sock, body)
);
export const forward = wrapController((body, req) =>
  svc.forwardMessage(req.sock, body)
);
export const react = wrapController((body, req) =>
  svc.reactToMessage(req.sock, body)
);
export const remove = wrapController((body, req) =>
  svc.deleteMessage(req.sock, body)
);
export const edit = wrapController((body, req) =>
  svc.editMessage(req.sock, body)
);
