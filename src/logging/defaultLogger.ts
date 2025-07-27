import { Logger } from "../types.js";

export class DefaultLogger implements Logger {
  info(msg: string, meta: object = {}) {
    console.log(`INFO: ${msg} - ${JSON.stringify(meta)}`);
  }
  warn(msg: string, meta: object = {}) {
    console.warn(`WARN: ${msg} - ${JSON.stringify(meta)}`);
  }
  error(msg: string, meta: object = {}) {
    console.error(`ERROR: ${msg} - ${JSON.stringify(meta)}`);
  }
  debug(msg: string, meta: object = {}) {
    if (process.env.DEBUG) {
      console.debug(`DEBUG: ${msg} - ${JSON.stringify(meta)}`);
    }
  }
}
