// @ts-ignore
import { warnOnce } from 'next/dist/shared/lib/utils/warn-once'
import { Agent } from 'https'

/**
 * If the http(s)_proxy environment variables is set, try to import and return a proxy agent.
 */
export function getProxyAgent(): Agent | undefined {
  const httpsProxy = process.env['https_proxy'] || process.env['HTTPS_PROXY']
  if (httpsProxy) {
    try {
      const HttpsProxyAgent = require('https-proxy-agent')
      return new HttpsProxyAgent(httpsProxy)
    } catch {
      warnOnce(
        "next/font/google detected https_proxy environment variable but couldn't import the 'https-proxy-agent' package. Please install it to use the proxy."
      )
      return
    }
  }

  const httpProxy = process.env['http_proxy'] || process.env['HTTP_PROXY']
  if (httpProxy) {
    try {
      const HttpProxyAgent = require('http-proxy-agent')
      return new HttpProxyAgent(httpProxy)
    } catch {
      warnOnce(
        "next/font/google detected http_proxy environment variable but couldn't import the 'https-proxy-agent' package. Please install it to use the proxy."
      )
      return
    }
  }
}
