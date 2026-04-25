const pino = require('pino')
const transport = pino.transport({
  targets: [
    { target: 'transport-a', level: 'error' },
    { target: 'transport-b', options: { destination: '/dev/null' } },
  ],
})
pino(transport)
