import pino from 'pino'
const logger = pino({
  transport: {
    target: 'my-pino-transport',
  },
})
