const p = require('pino')
const transport = p.transport({
  target: 'my-pino-transport',
})
p(transport)
