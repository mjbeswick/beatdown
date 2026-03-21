type Level = 'info' | 'warn' | 'error' | 'debug';

const LEVEL_PRIORITY: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function getConfiguredLevel(): Level {
  const rawLevel = process.env.BEATDOWN_LOG_LEVEL?.trim().toLowerCase();
  if (rawLevel === 'debug' || rawLevel === 'info' || rawLevel === 'warn' || rawLevel === 'error') {
    return rawLevel;
  }

  return 'info';
}

const configuredLevel = getConfiguredLevel();

function log(level: Level, msg: string, data?: unknown): void {
  if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[configuredLevel]) {
    return;
  }

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
