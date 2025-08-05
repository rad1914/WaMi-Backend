import fs from 'fs';
import path from 'path';
import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import morgan from 'morgan';
import routes from './routes.js';
import { initClient } from './client/client.js';
import { SESSION_BASE_DIR } from './config/config.js';

if (!fs.existsSync(SESSION_BASE_DIR)) {
  fs.mkdirSync(SESSION_BASE_DIR, { recursive: true });
  console.log(`📂 Created sessions directory at ${SESSION_BASE_DIR}`);
}

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(morgan('dev'));
app.use('/api', routes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`✅ API running on http://localhost:${PORT}/api`);
  await initClient();
});
