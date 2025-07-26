import { Logger } from '../types.js';

export class DefaultLogger implements Logger {
  info(msg: string, meta: object = {}) {
    console.log(JSON.stringify({ level: 'info', msg, ...meta }));
  }
  warn(msg: string, meta: object = {}) {
    console.warn(JSON.stringify({ level: 'warn', msg, ...meta }));
  }
  error(msg: string, meta: object = {}) {
    console.error(JSON.stringify({ level: 'error', msg, ...meta }));
  }
  debug(msg: string, meta: object = {}) {
    if (process.env.DEBUG) {
      console.log(JSON.stringify({ level: 'debug', msg, ...meta }));
    }
  }
}
