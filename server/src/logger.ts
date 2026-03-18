type Level = 'info' | 'warn' | 'error' | 'debug';

function log(level: Level, msg: string, data?: unknown): void {
  const ts = new Date().toISOString();
  const prefix = `[${ts}] [${level.toUpperCase().padEnd(5)}]`;
  const out = data !== undefined ? `${prefix} ${msg}` : `${prefix} ${msg}`;
  if (data !== undefined) {
    if (level === 'error') console.error(out, data);
    else if (level === 'warn') console.warn(out, data);
    else console.log(out, data);
  } else {
    if (level === 'error') console.error(out);
    else if (level === 'warn') console.warn(out);
    else console.log(out);
  }
}

export const logger = {
  info:  (msg: string, data?: unknown) => log('info',  msg, data),
  warn:  (msg: string, data?: unknown) => log('warn',  msg, data),
  error: (msg: string, data?: unknown) => log('error', msg, data),
  debug: (msg: string, data?: unknown) => log('debug', msg, data),
};
