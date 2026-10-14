import http from 'http'
import { nextTestSetup } from 'e2e-utils'

// Read sizes seen on a real socket for a ~150 KB multipart upload.
const CHUNK_SIZES = [65079, 457, 65536, 19599]
const BODY_SIZE = CHUNK_SIZES.reduce((a, b) => a + b, 0)

// Sends the body in several socket writes with a pause between them, so the
// server sees it as multiple reads rather than a single buffer.
function postInChunks(
  url: string,
  pauseMs: number
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      url,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/octet-stream',
          'content-length': String(BODY_SIZE),
        },
      },
      (res) => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', (data) => (body += data))
        res.on('end', () => resolve({ status: res.statusCode!, body }))
      }
    )
    req.on('error', reject)

    let sent = 0
    const writeNext = () => {
      if (sent === CHUNK_SIZES.length) {
        req.end()
        return
      }
      req.write(Buffer.alloc(CHUNK_SIZES[sent++], 1))
      setTimeout(writeNext, pauseMs)
    }
    writeNext()
  })
}

describe('middleware-body-clone', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it.each([0, 1, 5, 50])(
    'should give the route handler the whole body when it arrives in several chunks (%dms apart)',
    async (pauseMs) => {
      for (let i = 0; i < 3; i++) {
        const res = await postInChunks(next.url + '/api/echo', pauseMs)
        expect(res.status).toBe(200)
        expect(JSON.parse(res.body)).toEqual({
          total: BODY_SIZE,
          middleware: '1',
        })
      }
    }
  )
})
