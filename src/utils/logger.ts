/**
 * Centralised logger using Winston.
 *
 * All modules import `logger` from here for consistent log formatting.
 * Logs include timestamps and coloured levels in development.
 */

import winston from 'winston';

const { combine, timestamp, colorize, printf, errors } = winston.format;

const logFormat = printf(({ level, message, timestamp: ts, stack }) => {
  // If the logged value is an Error, include the stack trace
  return stack
    ? `${ts} [${level}] ${message}\n${stack}`
    : `${ts} [${level}] ${message}`;
});

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? 'info',
  format: combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    colorize({ all: true }),
    logFormat
  ),
  transports: [
    new winston.transports.Console(),
    // Also write full logs to a file for post-run debugging
    new winston.transports.File({
      filename: './output/logs/automation.log',
      format: combine(
        errors({ stack: true }),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        logFormat
      ),
    }),
  ],
});
