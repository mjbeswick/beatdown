type Level = 'info' | 'warn' | 'error' | 'debug';

function log(level: Level, msg: string, data?: unknown): void {
  const ts = new Date().toISOString();
  const prefix = `[${ts}] [${level.toUpperCase().padEnd(5)}]`;
  if (data !== undefined) {
    if (level === 'error') console.error(prefix, msg, data);
    else if (level === 'warn') console.warn(prefix, msg, data);
    else console.log(prefix, msg, data);
  } else {
    if (level === 'error') console.error(prefix, msg);
    else if (level === 'warn') console.warn(prefix, msg);
    else console.log(prefix, msg);
  }
}

export const logger = {
  info:  (msg: string, data?: unknown) => log('info',  msg, data),
  warn:  (msg: string, data?: unknown) => log('warn',  msg, data),
  error: (msg: string, data?: unknown) => log('error', msg, data),
  debug: (msg: string, data?: unknown) => log('debug', msg, data),
};
