// @path: index.js
import fs from 'fs';
import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import routes from './routes.js';
import { initClient } from './client/client.js';
import { SESSION_BASE_DIR } from './config/config.js';

dotenv.config();
fs.mkdirSync(SESSION_BASE_DIR, { recursive: true });

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use('/api', routes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`✅ API running on http://localhost:${PORT}/api`);
  try { await initClient(); } 
  catch (err) { console.error(`❌ Client init error: ${err.message}`); }
});
