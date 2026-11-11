import { createServer } from 'node:http'
import { once } from 'node:events'
const server = createServer((req, res) => res.end('config service'))
server.listen(0, '127.0.0.1')
await once(server, 'listening')
server.unref()
export default {
  test: {
    include: ['*.case.mjs'],
    provide: { url: `http://127.0.0.1:${server.address().port}` },
  },
}
