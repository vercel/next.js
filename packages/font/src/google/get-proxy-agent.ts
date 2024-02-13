import type { Agent } from 'https'

/**
 * If the http(s)_proxy environment variables is set, return a proxy agent.
 */
export function getProxyAgent(): Agent | undefined {
  throw new Error('dodo')
}
