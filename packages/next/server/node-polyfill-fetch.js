import fetch, { Headers, Request, Response } from 'node-fetch'
import { Agent as HttpAgent } from 'http'
import { Agent as HttpsAgent } from 'https'

// Polyfill fetch() in the Node.js environment
if (!global.fetch) {
  const httpAgent = new HttpAgent({ keepAlive: true })
  const httpsAgent = new HttpsAgent({ keepAlive: true })
  const agent = ({ protocol }) =>
    protocol === 'http:' ? httpAgent : httpsAgent
  const fetchWithAgent = (url, opts, ...rest) => {
    if (!opts) {
      opts = { agent }
    } else if (!opts.agent) {
      opts.agent = agent
    }
    return fetch(url, opts, ...rest)
  }
  global.fetch = fetchWithAgent
  global.Headers = Headers
  global.Request = Request
  global.Response = Response
}
