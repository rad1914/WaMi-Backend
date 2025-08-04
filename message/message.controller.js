// @path: message/message.controller.js
import * as svc from './message.service.js';
import { wrapController } from '../utils/utils.js';

const mapping = {
  send:    'sendMessage',
  reply:   'replyToMessage',
  forward: 'forwardMessage',
  react:   'reactToMessage',
  delete:  'deleteMessage',
  edit:    'editMessage'
};

export const controllers = Object.entries(mapping)
  .reduce((out, [route, svcFn]) => {
    out[route] = wrapController((body, req) =>
      svc[svcFn](req.sock, body)
    );
    return out;
  }, {});
