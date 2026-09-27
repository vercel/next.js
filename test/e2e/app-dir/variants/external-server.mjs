import { createServer } from 'node:http'

/**
 * Stands in for an origin outside this Next.js application, so that a test can
 * exercise a proxy rewrite to another origin.
 *
 * The server records each request it receives. A test reads those records to
 * assert that nothing variant-related reached an origin that does not remove an
 * internal header.
 */
export async function startExternalServer(port) {
  const receivedRequests = []

  const server = createServer((request, response) => {
    receivedRequests.push({ url: request.url, headers: request.headers })

    response.writeHead(200, { 'content-type': 'text/html' })
    response.end('<html><body><p id="external">external</p></body></html>')
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, resolve)
  })

  return {
    getReceivedRequests: () => receivedRequests,
    cleanup: () => new Promise((resolve) => server.close(resolve)),
  }
}
