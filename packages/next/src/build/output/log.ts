import { bold, green, magenta, red, yellow, white } from '../../lib/picocolors'

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
    console[consoleMethod](' ' + prefix, ...message)
  }
}

export function bootstrap(...message: any[]) {
  console.log(' ', ...message)
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

const warnOnceMessages = new Set()
export function warnOnce(...message: any[]) {
  if (!warnOnceMessages.has(message[0])) {
    warnOnceMessages.add(message.join(' '))

    warn(...message)
  }
}
