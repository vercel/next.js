import http from 'http'

type TestDataResponse = {
  _res: http.ServerResponse
  resolve: (value?: string) => any
  reject: (value: any) => any
}

type TestDataServer = {
  _server: http.Server
  listen: (port: number) => void
  close: () => void
}

// Creates a lightweight HTTP server for use in e2e testing. This simulates the
// data service that would be used in a real Next.js application, whether it's
// direct database access, an ORM, or a higher-level data access layer. The e2e
// test can observe when individual requests are received, and control the
// timing of when the data is fulfilled, without needing to mock any lower
// level I/O.
//
// Receives requests of the form: /?key=foo
//
// Responds in plain text. By default, the response is the key itself, but the
// e2e test can respond with any text it wants.
//
// Examples:
//   response.resolve() // Responds with the key itself
//   response.resolve('custom') // Responds with custom text
//   response.reject(new Error('oops!')) // Responds with a 500 error
//
// Based on the AsyncText pattern used in the React repo.
export function createTestDataServer(
  onRequest: (key: string, response: TestDataResponse) => any
): TestDataServer {
  const httpServer = http.createServer(async (req, res) => {
    const searchParams = new URL(req.url, 'http://n').searchParams
    const key = searchParams.get('key')

    if (typeof key !== 'string') {
      res.statusCode = 400
      const msg = 'Missing key parameter'
      res.end(msg)
      return
    }

    const response: TestDataResponse = {
      _res: res,
      resolve(value?: string) {
        res.end(value === undefined ? key : value)
      },
      reject(error: Error, status?: number) {
        res.statusCode = status ?? 500
        res.end(error.message ?? `Failed to fetch data for "${key}"`)
      },
    }

    try {
      const result = await onRequest(key, response)
      if (typeof result === 'string') {
        response.resolve(result)
      }
    } catch (error) {
      response.reject(error)
    }
  })
  return {
    _server: httpServer,
    listen(port: number) {
      httpServer.listen(port)
    },
    close() {
      httpServer.close()
    },
  }
}
