import { nextTestSetup } from 'e2e-utils'
import http from 'node:http'

describe('invalid request target', () => {
  const { next } = nextTestSetup({ files: __dirname })

  it('responds 400 to an OPTIONS * request target', async () => {
    const url = new URL(next.url)
    const status = await new Promise<number>((resolve, reject) => {
      const req = http.request(
        {
          hostname: url.hostname,
          port: url.port,
          method: 'OPTIONS',
          path: '*',
        },
        (res) => {
          res.resume()
          resolve(res.statusCode!)
        }
      )
      req.on('error', reject)
      req.end()
    })
    expect(status).toBe(400)
  })
})
