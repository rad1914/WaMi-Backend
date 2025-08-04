// @path: chats/chats.controller.js
import * as svc from './chats.service.js';
import { wrapController } from '../utils/utils.js';

export const getAllChats = wrapController((_, req) =>
  svc.getAllChats(req.sock)
);

export const getPinnedChats = wrapController((_, req) =>
  svc.getPinnedChats(req.sock)
);

export const getChatByJid = wrapController((_, req) =>
  svc.getChatByJid(req.sock, req.params.jid)
);
