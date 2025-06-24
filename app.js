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
import { db, deleteSessionData } from './database.js';
import { logger } from './logger.js';
import errorHandler from './middleware/errorHandler.js';
import { runCleanupWorker } from './workers/CleanupWorker.js';

import sessionRoutes from './routes/session.js';
import chatRoutes from './routes/chat.js';
import messageRoutes from './routes/message.js';
import mediaRoutes from './routes/media.js';

dotenv.config();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3007;
const SESSIONS_DIR = process.env.SESSIONS_DIR || './auth_sessions';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const SESSION_CLEANUP_INTERVAL = process.env.SESSION_CLEANUP_INTERVAL || 900000;

export const sessions = new Map();

const WORKERS_DIR = path.join(path.resolve(), 'workers');
if (!fs.existsSync(WORKERS_DIR)) {
  fs.mkdirSync(WORKERS_DIR, { recursive: true });
}

if (!fs.existsSync(SESSIONS_DIR)) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

app.use(helmet());
app.use(express.json());
app.use(cors({ origin: CORS_ORIGIN }));

const io = new Server(server, { cors: { origin: CORS_ORIGIN } });
app.set('io', io);

app.use((req, _, next) => {
  const sid = req.headers.authorization?.split(' ')[1] || 'N/A';
  const logBody = req.path.includes('/send/media')
    ? { ...req.body, file: '...omitted...' }
    : req.body;

  logger.info(`[${sid}] ${req.method} ${req.url} - ${JSON.stringify(logBody)}`);
  next();
});

io.use((socket, next) => {
  const sid = socket.handshake.auth.token;
  if (sid && sessions.has(sid)) {
    return next();
  }
  logger.warn(`Rejected socket via middleware with invalid or missing SID: ${sid}`);
  next(new Error('Invalid session ID'));
});

io.on('connection', socket => {
  const sid = socket.handshake.auth?.token;
  const session = sessions.get(sid);

  if (!session) {
    logger.error(`[${sid}] Connection handler reached with invalid session. Disconnecting.`);
    socket.disconnect(true);
    return;
  }

  socket.join(sid);
  logger.info(`[${sid}] Socket connected`);

  if (session.isAuthenticated) {
    logger.info(`[${sid}] Session is already authenticated, notifying new socket.`);
    socket.emit('authenticated');
  }
});

app.use('/session', sessionRoutes);
app.use(chatRoutes);
app.use(messageRoutes);
app.use(mediaRoutes);

app.use(errorHandler);

export const createOnLogout = (id) => () => {
  logger.info(`Session ${id} logged out`);

  const sessionPath = path.join(SESSIONS_DIR, id);
  if (fs.existsSync(sessionPath)) {
    fs.rmSync(sessionPath, { recursive: true, force: true });
  }
  
  try {
    deleteSessionData(id);
    logger.info(`[${id}] Deleted session data from database.`);
  } catch (err) {
    logger.error(`[${id}] Failed to delete session data from database:`, err);
  }

  sessions.delete(id);
};

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

const listener = server.listen(PORT, () => {
  logger.info(`Server listening on port ${PORT}`);
  setInterval(() => {
    runCleanupWorker({ sessions, SESSIONS_DIR, createOnLogout, logger });
  }, SESSION_CLEANUP_INTERVAL);
});

const gracefulShutdown = (signal) => {
  logger.info(`${signal} received. Shutting down...`);

  listener.close(() => {
    sessions.forEach(s => {
      // MODIFICADO: Añadir una bandera para indicar que el cierre es intencional
      s.isShuttingDown = true;
      s.sock?.end(new Error('Server shutting down'));
    });

    db.close(err => {
      if (err) {
        logger.error('Database close error:', err);
      }
      process.exit(0);
    });
  });
};

restoreSessions();

['SIGINT', 'SIGTERM'].forEach(sig => process.on(sig, () => gracefulShutdown(sig)));
