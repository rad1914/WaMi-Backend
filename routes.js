import { Router } from 'express';
import authRoutes from './auth/auth.routes.js';
import msgRoutes  from './message/message.routes.js';
import chatRoutes from './chats/chats.routes.js';

export default Router()
  .use('/auth',    authRoutes)
  .use('/message', msgRoutes)
  .use('/chats',   chatRoutes);
