// for transport({target: 'pino-pretty'}) to work
require('pino-pretty')

const { pino, transport } = require('pino')

const loggerOptions = {
  level: 'info',
  timestamp: false,
}
const loggerTransport = transport({
  target: 'pino-pretty',
  options: {
    ignore: 'pid,hostname',
  },
})
const logger = pino(loggerOptions, loggerTransport)

logger.info('foo')
