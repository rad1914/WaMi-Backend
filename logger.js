// logger.js
import P from 'pino';
import pinoHttp from 'pino-http';

const isDev = process.env.NODE_ENV === 'development';

const logger = P({
  level: process.env.LOG_LEVEL || 'debug',
  ...(isDev && { // Conditionally adds transport for development
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname'
      }
    }
  })
});

const httpLogger = pinoHttp({ logger });

export { logger, httpLogger };
