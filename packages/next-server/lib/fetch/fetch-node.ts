import { parse } from 'url'
import { Headers } from 'node-fetch'
import { getUrl, getAgent, NodeFetch } from './utils'

export default function setupFetch(fetch: NodeFetch) {
  const fn: NodeFetch = (url, opts = {}) => {
    if (!opts.agent) {
      // Add default `agent` if none was provided
      opts.agent = getAgent(url)
    }

    opts.headers = new Headers(opts.headers)
    // Workaround for node-fetch + agentkeepalive bug/issue
    opts.headers.set('host', opts.headers.get('host') || parse(getUrl(url)).host || '')

    return fetch(url, opts)
  }
  return fn
}
