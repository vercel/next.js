import chalk from 'chalk'

const prefixes = {
  wait: chalk`[ {cyan wait} ] `,
  error: chalk`[ {red error} ]`,
  warn: chalk`[ {yellow warn} ] `,
  ready: chalk`[ {green ready} ]`,
  info: chalk`[ {cyan {dim info}} ] `,
  event: chalk`[ {magenta event} ]`,
}

export function wait(...message: string[]) {
  console.log(prefixes.wait, ...message)
}

export function error(...message: string[]) {
  console.log(prefixes.error, ...message)
}

export function warn(...message: string[]) {
  console.log(prefixes.warn, ...message)
}

export function ready(...message: string[]) {
  console.log(prefixes.ready, ...message)
}

export function info(...message: string[]) {
  console.log(prefixes.info, ...message)
}

export function event(...message: string[]) {
  console.log(prefixes.event, ...message)
}
