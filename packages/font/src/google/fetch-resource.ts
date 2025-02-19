import http from 'node:http'
import https from 'node:https'
import { getProxyAgent } from './get-proxy-agent'

/**
 * Makes a simple GET request and returns the entire response as a Buffer.
 * - Throws if the response status is not 200.
 * - Applies a 3000 ms timeout when `isDev` is `true`.
 */
export function fetchResource(
  url: string,
  isDev: boolean,
  errorMessage?: string
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const { protocol } = new URL(url)
    const client = protocol === 'https:' ? https : http
    const timeout = isDev ? 3000 : undefined

    const req = client.request(
      url,
      {
        agent: getProxyAgent(),
        headers: {
          // The file format is based off of the user agent, make sure woff2 files are fetched
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
            'AppleWebKit/537.36 (KHTML, like Gecko) ' +
            'Chrome/104.0.0.0 Safari/537.36',
        },
      },
      (res) => {
        if (res.statusCode !== 200) {
          reject(
            new Error(
              errorMessage ||
                `Request failed: ${url} (status: ${res.statusCode})`
            )
          )
          return
        }
        const chunks: Buffer[] = []
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
        res.on('end', () => resolve(Buffer.concat(chunks)))
      }
    )

    if (timeout) {
      req.setTimeout(timeout, () => {
        req.destroy(new Error(`Request timed out after ${timeout}ms`))
      })
    }

    req.on('error', (err) => reject(err))
    req.end()
  })
}
