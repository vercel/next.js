// @ts-ignore
import { Agent } from 'next/src/compiled/undici'

/* If the http(s)_proxy environment variables is set, return a proxy agent. */
export function getProxyAgent(): Agent | undefined {
  const proxy =
    process.env['https_proxy'] ??
    process.env['HTTPS_PROXY'] ??
    process.env['http_proxy'] ??
    process.env['HTTP_PROXY']

  if (proxy) return new Agent(proxy)
}
