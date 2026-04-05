import winston from 'winston'
import path from 'path'

const { combine, timestamp, errors, json, colorize, printf } = winston.format

const safeStringify = (obj: any) => {
  try {
    return JSON.stringify(obj, null, 2)
  } catch {
    return '[Circular Object]'
  }
}

const devFormat = printf(({ level, message, timestamp: ts, stack, ...meta }) => {
  const metaStr = Object.keys(meta).length ? `\n${safeStringify(meta)}` : ''
  return `${ts} [${level}]: ${stack ?? message}${metaStr}`
})

const isDev = process.env.NODE_ENV !== 'production'

export const logger = winston.createLogger({
  level: isDev ? 'debug' : 'info',
  format: combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    isDev
      ? combine(colorize(), devFormat)
      : json()
  ),
  transports: [
    new winston.transports.Console(),
    ...(isDev ? [] : [
      new winston.transports.File({
        filename: path.join('logs', 'error.log'),
        level: 'error',
        maxsize: 5 * 1024 * 1024,
        maxFiles: 5,
      }),
      new winston.transports.File({
        filename: path.join('logs', 'combined.log'),
        maxsize: 10 * 1024 * 1024,
        maxFiles: 5,
      }),
    ]),
  ],
})

// HTTP request logger stream for Morgan
export const httpLogStream = {
  write: (message: string) => logger.http(message.trim()),
}
