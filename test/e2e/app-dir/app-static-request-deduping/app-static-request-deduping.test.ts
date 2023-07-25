import { findPort } from 'next-test-utils'
import http from 'http'
import { FileRef, createNext } from 'e2e-utils'

describe('incremental cache request deduping', () => {
  let externalServerPort: number
  let externalServer: http.Server
  let requests = []
  beforeAll(async () => {
    externalServerPort = await findPort()
    externalServer = http.createServer((req, res) => {
      requests.push(req.url)
      res.end(`Request ${req.url} received at ${Date.now()}`)
    })

    await new Promise<void>((resolve, reject) => {
      externalServer.listen(externalServerPort, () => {
        resolve()
      })

      externalServer.once('error', (err) => {
        reject(err)
      })
    })
  })

  beforeEach(() => {
    requests = []
  })

  it('uses a shared IPC cache amongst workers to dedupe requests', async () => {
    const next = await createNext({
      files: new FileRef(__dirname),
      env: { TEST_SERVER_PORT: `${externalServerPort}` },
    })

    await next.destroy()

    expect(requests.length).toBe(1)
  })

  afterAll(() => {
    externalServer.close()
  })
})
