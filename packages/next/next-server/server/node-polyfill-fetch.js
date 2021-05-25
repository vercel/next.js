import fetch, { Headers, Request, Response } from 'node-fetch'
import AbortController from 'abort-controller'

// Polyfill fetch() in the Node.js environment
if (!global.fetch) {
  global.fetch = fetch
  global.Headers = Headers
  global.Request = Request
  global.Response = Response
  global.AbortController = AbortController
}
