import nodeFetch, { RequestInit } from 'node-fetch'
import setupFetch, { NodeFetch } from './fetch-node'
import setupRetry, { RetryOptions } from './retry'

export type Fetch = NodeFetch<RequestInit & { retry?: RetryOptions }>

// node-fetch types are not compatible with dom types
const fetchRetry = setupRetry(nodeFetch as any) as any
const fetch = setupFetch(fetchRetry) as Fetch

export default fetch
