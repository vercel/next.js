import * as pc from './picocolors'

// Mirrors the prefixes of Next.js' own CLI output so upgrade messages printed
// from `next dev`, `next build` and `next upgrade` look the same as before.
export const prefixes = {
  wait: pc.white(pc.bold('○')),
  error: pc.red(pc.bold('⨯')),
  warn: pc.yellow(pc.bold('⚠')),
  ready: '▲', // no color
  info: pc.white(pc.bold(' ')),
  event: pc.green(pc.bold('✓')),
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
  } else if (message.length === 1 && typeof message[0] === 'string') {
    console[consoleMethod](prefix + ' ' + message[0])
  } else {
    console[consoleMethod](prefix, ...message)
  }
}

export function bootstrap(message: string) {
  console.log(message)
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
