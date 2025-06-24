// @path: app.js
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import helmet from 'helmet';
import cors from 'cors';

import { createWhatsappSession } from './whatsapp-service.js';
import { db } from './database.js';
import { logger } from './logger.js';
import errorHandler from './middleware/errorHandler.js';

import sessionRoutes from './routes/session.js';
import chatRoutes from './routes/chat.js';
import messageRoutes from './routes/message.js';
import mediaRoutes from './routes/media.js';

dotenv.config();

// === Initialization ===
const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3007;
const SESSIONS_DIR = process.env.SESSIONS_DIR || './auth_sessions';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

export const sessions = new Map();

// === Ensure sessions directory exists ===
if (!fs.existsSync(SESSIONS_DIR)) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

// === Middleware ===
app.use(helmet());
app.use(express.json());
app.use(cors({ origin: CORS_ORIGIN }));

// === Attach Socket.IO ===
const io = new Server(server, { cors: { origin: CORS_ORIGIN } });
app.set('io', io);

// === Logging middleware ===
app.use((req, _, next) => {
  const sid = req.headers.authorization?.split(' ')[1] || 'N/A';
  const logBody = req.path.includes('/send/media')
    ? { ...req.body, file: '...omitted...' }
    : req.body;

  logger.info(`[${sid}] ${req.method} ${req.url} - ${JSON.stringify(logBody)}`);
  next();
});

// === Socket.IO connection handler ===
io.on('connection', socket => {
  const sid = socket.handshake.auth?.token;

  if (sid && sessions.has(sid)) {
    socket.join(sid);
    logger.info(`[${sid}] Socket connected`);
  } else {
    logger.warn(`Rejected socket with invalid or missing SID: ${sid}`);
    socket.disconnect(true);
  }
});

// === Routes ===
app.use('/session', sessionRoutes);
app.use(chatRoutes);
app.use(messageRoutes);
app.use(mediaRoutes);

// === Error handler (last middleware) ===
app.use(errorHandler);

// === Cleanup function for logout ===
export const createOnLogout = (id) => () => {
  logger.info(`Session ${id} logged out`);

  const sessionPath = path.join(SESSIONS_DIR, id);
  if (fs.existsSync(sessionPath)) {
    fs.rmSync(sessionPath, { recursive: true, force: true });
  }

  sessions.delete(id);
};

// === Restore sessions from filesystem ===
function restoreSessions() {
  try {
    const ids = fs.readdirSync(SESSIONS_DIR)
      .filter(d => fs.statSync(path.join(SESSIONS_DIR, d)).isDirectory());

    ids.forEach(id => {
      const session = {
        id,
        sock: null,
        isAuthenticated: false,
        latestQR: null,
        io: io.to(id)
      };
      sessions.set(id, session);
      createWhatsappSession(session, createOnLogout(id));
    });

    logger.info(`Restored ${ids.length} session(s).`);
  } catch (e) {
    if (e.code !== 'ENOENT') {
      logger.error('Session restore failed:', e);
    }
  }
}

// === Start Server ===
const listener = server.listen(PORT, () => {
  logger.info(`Server listening on port ${PORT}`);
  restoreSessions();
});

// === Graceful shutdown ===
const gracefulShutdown = (signal) => {
  logger.info(`${signal} received. Shutting down...`);

  listener.close(() => {
    sessions.forEach(s => s.sock?.end(new Error('Server shutting down')));

    db.close(err => {
      if (err) {
        logger.error('Database close error:', err);
      }
      process.exit(0);
    });
  });
};

['SIGINT', 'SIGTERM'].forEach(sig => process.on(sig, () => gracefulShutdown(sig)));
