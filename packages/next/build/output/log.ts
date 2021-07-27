import chalk from 'chalk'

export const prefixes: {
  wait: string
  error: string
  warn: string
  ready: string
  info: string
  event: string
} = {
  wait: chalk.cyan('wait') + '  -',
  error: chalk.red('error') + ' -',
  warn: chalk.yellow('warn') + '  -',
  ready: chalk.green('ready') + ' -',
  info: chalk.cyan('info') + '  -',
  event: chalk.magenta('event') + ' -',
}

export const wait = (...message: string[]): void => {
  console.log(prefixes.wait, ...message)
}

export const error = (...message: string[]): void => {
  console.error(prefixes.error, ...message)
}

export const warn = (...message: string[]): void => {
  console.warn(prefixes.warn, ...message)
}

export const ready = (...message: string[]): void => {
  console.log(prefixes.ready, ...message)
}

export const info = (...message: string[]): void => {
  console.log(prefixes.info, ...message)
}

export function event(...message: string[]) {
  console.log(prefixes.event, ...message)
}
