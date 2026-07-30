import { createServer } from 'node:http'

/**
 * Stands in for an origin that is not this Next.js app, so that a proxy rewrite
 * to a different origin can be exercised.
 *
 * The received URLs are recorded because that is what proves the variants
 * prefix was not spliced into a destination the other origin knows nothing
 * about, and would therefore not strip.
 */
export async function startExternalServer(port) {
  const receivedUrls = []

  const server = createServer((request, response) => {
    receivedUrls.push(request.url)

    response.writeHead(200, { 'content-type': 'text/html' })
    response.end('<html><body><p id="external">external</p></body></html>')
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, resolve)
  })

  return {
    getReceivedUrls: () => receivedUrls,
    cleanup: () => new Promise((resolve) => server.close(resolve)),
  }
}
