import pino from 'pino';
import { config } from './config.js';

const prettyInDevelopment =
  !config.isProduction && process.stdout.isTTY && config.logLevel !== 'silent';

export const logger = pino({
  level: config.logLevel,
  base: { service: 'pantry-api' },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: ['*.password', '*.token', '*.authorization', '*.cookie'],
    censor: '[redacted]',
  },
  transport: prettyInDevelopment ? { target: 'pino-pretty' } : undefined,
});