import { Agent as HttpAgent } from 'node:http'
import { Agent as HttpsAgent } from 'node:https'

/* If the http(s)_proxy environment variables are set, return a proxy agent. */
export function getProxyAgent() {
  const httpProxy = process.env['http_proxy'] ?? process.env['HTTP_PROXY']
  const httpsProxy = process.env['https_proxy'] ?? process.env['HTTPS_PROXY']

  if (httpsProxy) return new HttpsAgent({ host: httpsProxy })
  return new HttpAgent({ host: httpProxy })
}
