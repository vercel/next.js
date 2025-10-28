import { createServer } from 'node:http'

let receivedRequests = []

function createExternalServer() {
  const server = createServer((req, res) => {
    const requestUrl = `${req.url}`
    console.log('External server received request:', requestUrl)

    // Store the request for testing
    receivedRequests.push({
      url: requestUrl,
      method: req.method,
      headers: req.headers,
      timestamp: Date.now(),
    })

    // Simple response
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(`
      <html>
        <body>
          <h1>External Server Response</h1>
          <p>Request URL: ${requestUrl}</p>
          <div id="external-response">External server handled the request</div>
        </body>
      </html>
    `)
  })

  return server
}

export async function startExternalServer(port) {
  receivedRequests = [] // Reset requests
  const server = createExternalServer()

  const cleanup = async () => {
    await new Promise((resolve) => server.close(resolve))
  }

  return new Promise((resolve, reject) => {
    server.on('error', reject)
    server.listen(port, () => {
      console.log('External server listening on port', port)
      resolve({ cleanup, getReceivedRequests: () => receivedRequests })
    })
  })
}
