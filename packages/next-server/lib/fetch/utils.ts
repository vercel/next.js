import { Response, Request, RequestInit } from 'node-fetch'
import HttpAgent, { HttpsAgent, HttpOptions } from 'agentkeepalive'

const AGENT_OPTS: HttpOptions = {
  maxSockets: 200,
  maxFreeSockets: 20,
  timeout: 60000, // active socket keepalive for 60 seconds
  freeSocketKeepAliveTimeout: 30000, // free socket keepalive for 30 seconds
}

let defaultHttpGlobalAgent: HttpAgent
let defaultHttpsGlobalAgent: HttpAgent

function getDefaultHttpsGlobalAgent() {
  return (defaultHttpsGlobalAgent = defaultHttpsGlobalAgent || new HttpsAgent(AGENT_OPTS))
}

function getDefaultHttpGlobalAgent() {
  return (defaultHttpGlobalAgent = defaultHttpGlobalAgent || new HttpAgent(AGENT_OPTS))
}

export type NodeFetch<O = RequestInit> = (
  url: string | Request,
  opts?: O,
) => Promise<Response>

export function getUrl(url: string | Request) {
  return url instanceof Request ? url.url : url
}

export function getAgent(url: string | Request) {
  return /^https/.test(getUrl(url))
    ? getDefaultHttpsGlobalAgent()
    : getDefaultHttpGlobalAgent()
}
