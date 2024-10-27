import type { NextConfig } from '../types'
import { Agent as HttpAgent } from 'http'
import { Agent as HttpsAgent } from 'https'

export function setHttpClientAndAgentOptions(config: {
  httpAgentOptions?: NextConfig['httpAgentOptions']
}) {
  if (globalThis.__NEXT_HTTP_AGENT) {
    // We only need to assign once because we want
    // to reuse the same agent for all requests.
    return
  }

  if (!config) {
    throw new Error('Expected config.httpAgentOptions to be an object')
  }

  globalThis.__NEXT_HTTP_AGENT_OPTIONS = config.httpAgentOptions
  globalThis.__NEXT_HTTP_AGENT = new HttpAgent(config.httpAgentOptions)
  globalThis.__NEXT_HTTPS_AGENT = new HttpsAgent(config.httpAgentOptions)
}
