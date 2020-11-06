import fetch, { Headers, Request, Response } from 'node-fetch'

// Polyfill fetch() in the Node.js environment
if (!global.fetch) {
  global.fetch = fetch
  global.Headers = Headers
  global.Request = Request
  global.Response = Response
}
