'use strict';

const path    = require('path');
const fs      = require('fs');
const winston = require('winston');
const config  = require('../config');

// Ensure log directory exists
const logDir = config.logging.dir;
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

const { combine, timestamp, errors, splat, json, colorize, printf } = winston.format;

const consoleFormat = combine(
  colorize({ all: true }),
  timestamp({ format: 'HH:mm:ss' }),
  printf(({ timestamp: ts, level, message, ...meta }) => {
    const extras = Object.keys(meta).length
      ? ' ' + JSON.stringify(meta, null, 0)
      : '';
    return `${ts} [${level}] ${message}${extras}`;
  }),
);

const fileFormat = combine(
  timestamp(),
  errors({ stack: true }),
  splat(),
  json(),
);

const logger = winston.createLogger({
  level: config.logging.level,
  transports: [
    new winston.transports.Console({
      format: consoleFormat,
      silent: process.env.NODE_ENV === 'test',
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      format: fileFormat,
      maxsize:  10 * 1024 * 1024,
      maxFiles: 5,
      tailable: true,
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      format: fileFormat,
      maxsize:  50 * 1024 * 1024,
      maxFiles: 10,
      tailable: true,
    }),
  ],
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logDir, 'exceptions.log'),
      format: fileFormat,
    }),
  ],
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logDir, 'rejections.log'),
      format: fileFormat,
    }),
  ],
});

// Add http level for request logging
winston.addColors({ http: 'magenta' });

module.exports = logger;
