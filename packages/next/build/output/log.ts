import chalk from 'chalk'

export const prefixes = {
  wait: chalk.cyan('wait') + '  -',
  error: chalk.red('error') + ' -',
  warn: chalk.yellow('warn') + '  -',
  ready: chalk.green('ready') + ' -',
  info: chalk.cyan('info') + '  -',
  event: chalk.magenta('event') + ' -',
}

let logger = console as Logger

export interface Logger {
  error: (...args: string[]) => void
  log: (...args: string[]) => void
  warn: (...args: string[]) => void
}

export function use(newLogger: Logger) {
  logger = newLogger
}

export function wait(...message: string[]) {
  logger.log(prefixes.wait, ...message)
}

export function error(...message: string[]) {
  logger.error(prefixes.error, ...message)
}

export function warn(...message: string[]) {
  logger.warn(prefixes.warn, ...message)
}

export function ready(...message: string[]) {
  logger.log(prefixes.ready, ...message)
}

export function info(...message: string[]) {
  logger.log(prefixes.info, ...message)
}

export function event(...message: string[]) {
  logger.log(prefixes.event, ...message)
}
