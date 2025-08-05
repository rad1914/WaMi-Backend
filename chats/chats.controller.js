import * as service from './chats.service.js';
import { wrapController } from '../utils/utils.js';

export const getAllChats = wrapController(async (_input, req) =>
  service.getAllChats(req.sock)
);

export const getChatByJid = wrapController(async ({ jid }, req) =>
  service.getChatByJid(req.sock, jid)
);

export 
const getPinnedChats = wrapController((_, req) =>
  svc.getPinnedChats(req.sock)
);
