interface Logger {
  warn(...message: unknown[]): void
  error(...message: unknown[]): void
}

function createLogger(): Logger {
  if (process.env.NEXT_RUNTIME !== 'edge') {
    return require('../../../../build/output/log')
  } else {
    return {
      warn: console.warn.bind(console),
      error: console.error.bind(console),
    }
  }
}

const logger = createLogger()

export default logger
