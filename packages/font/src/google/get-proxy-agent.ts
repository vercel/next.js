// @ts-ignore
import { ProxyAgent } from 'next/dist/compiled/undici'

/* If the http(s)_proxy environment variables are set, return a proxy agent. */
export function getProxyAgent() {
  const proxy =
    process.env['https_proxy'] ??
    process.env['HTTPS_PROXY'] ??
    process.env['http_proxy'] ??
    process.env['HTTP_PROXY']

  if (proxy) return new ProxyAgent(proxy)
}
