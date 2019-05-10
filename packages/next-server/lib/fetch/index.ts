import nodeFetch, { RequestInit } from 'node-fetch'
import { NodeFetch } from './utils'
import setupFetch from './fetch-node'
import setupFollowRedirect from './follow'
import setupRetry, { RetryOptions } from './retry'

export type Fetch = NodeFetch<RequestInit & { retry?: RetryOptions }>

const fetchRedirect = setupFollowRedirect(nodeFetch)
// node-fetch types are not compatible with dom types
const fetchRetry = setupRetry(fetchRedirect as any) as any
const fetch = setupFetch(fetchRetry) as Fetch

export default fetch
