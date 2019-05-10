import { parse } from 'url'
import { Headers, Response, Request, RequestInit } from 'node-fetch'
import HttpAgent, { HttpsAgent, HttpOptions } from 'agentkeepalive'

const AGENT_OPTS: HttpOptions = {
  maxSockets: 200,
  maxFreeSockets: 20,
  timeout: 60000, // active socket keepalive for 60 seconds
  freeSocketKeepAliveTimeout: 30000, // free socket keepalive for 30 seconds
}

export type NodeFetch = (
  url: string | Request,
  init?: RequestInit,
) => Promise<Response>

let defaultHttpGlobalAgent: HttpAgent
let defaultHttpsGlobalAgent: HttpAgent

function getDefaultHttpsGlobalAgent() {
  return (defaultHttpsGlobalAgent = defaultHttpsGlobalAgent || new HttpsAgent(AGENT_OPTS))
}

function getDefaultHttpGlobalAgent() {
  return (defaultHttpGlobalAgent = defaultHttpGlobalAgent || new HttpAgent(AGENT_OPTS))
}

function getAgent(url: string | Request) {
  return /^https/.test(getUrl(url))
    ? getDefaultHttpsGlobalAgent()
    : getDefaultHttpGlobalAgent()
}

function getUrl(url: string | Request) {
  return url instanceof Request ? url.url : url
}

export default function setupFetch(fetch: NodeFetch) {
  const fn: NodeFetch = async (url, opts = {}) => {
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
