import { bold, green, magenta, red, yellow, white } from '../../lib/picocolors'
import { LRUCache } from '../../server/lib/lru-cache'

export const prefixes = {
  wait: white(bold('○')),
  error: red(bold('⨯')),
  warn: yellow(bold('⚠')),
  ready: '▲', // no color
  info: white(bold(' ')),
  event: green(bold('✓')),
  trace: magenta(bold('»')),
} as const

const LOGGING_METHOD = {
  log: 'log',
  warn: 'warn',
  error: 'error',
} as const

function prefixedLog(prefixType: keyof typeof prefixes, ...message: any[]) {
  if ((message[0] === '' || message[0] === undefined) && message.length === 1) {
    message.shift()
  }

  const consoleMethod: keyof typeof LOGGING_METHOD =
    prefixType in LOGGING_METHOD
      ? LOGGING_METHOD[prefixType as keyof typeof LOGGING_METHOD]
      : 'log'

  const prefix = prefixes[prefixType]
  // If there's no message, don't print the prefix but a new line
  if (message.length === 0) {
    console[consoleMethod]('')
  } else {
    // Ensure if there's ANSI escape codes it's concatenated into one string.
    // Chrome DevTool can only handle color if it's in one string.
    if (message.length === 1 && typeof message[0] === 'string') {
      console[consoleMethod](' ' + prefix + ' ' + message[0])
    } else {
      console[consoleMethod](' ' + prefix, ...message)
    }
  }
}

export function bootstrap(...message: string[]) {
  // logging format: ' <prefix> <message>'
  // e.g. ' ✓ Compiled successfully'
  // Add spaces to align with the indent of other logs
  console.log('   ' + message.join(' '))
}

export function wait(...message: any[]) {
  prefixedLog('wait', ...message)
}

export function error(...message: any[]) {
  prefixedLog('error', ...message)
}

export function warn(...message: any[]) {
  prefixedLog('warn', ...message)
}

export function ready(...message: any[]) {
  prefixedLog('ready', ...message)
}

export function info(...message: any[]) {
  prefixedLog('info', ...message)
}

export function event(...message: any[]) {
  prefixedLog('event', ...message)
}

export function trace(...message: any[]) {
  prefixedLog('trace', ...message)
}

const warnOnceCache = new LRUCache<string>(10_000, (value) => value.length)
export function warnOnce(...message: any[]) {
  const key = message.join(' ')
  if (!warnOnceCache.has(key)) {
    warnOnceCache.set(key, key)
    warn(...message)
  }
}
