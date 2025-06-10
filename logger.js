// logger.js
import P from 'pino';
import pinoHttp from 'pino-http';
import path from 'path';

const isDev = process.env.NODE_ENV === 'development';

const logger = P({
  level: process.env.LOG_LEVEL || 'debug',
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true, // Adds colors to logs for easier reading
          translateTime: 'SYS:standard', // Use a standard date/time format
          ignore: 'pid,hostname' // Optionally remove pid and hostname from output
        }
      }
    : undefined, // No transport if it's not in development
});

const httpLogger = pinoHttp({ logger });

export { logger, httpLogger };
