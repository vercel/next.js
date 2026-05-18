import fastify from 'fastify'
const app = fastify({
  logger: {
    transport: {
      target: 'my-pino-transport',
    },
  },
})
