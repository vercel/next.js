import { nextTestSetup } from 'e2e-utils'
import { request } from 'node:http'

const route = '/sites/[tenant]/[[...slug]]'
const placeholders = '?nxtPtenant=%5Btenant%5D&nxtPslug=%5B%5B...slug%5D%5D'

// Exercise the platform's private resume protocol with state from the local build.
// @force-gate !deploy
describe.each(['', '/docs'])(
  'PPR resume through a host rewrite in minimal mode (basePath %j)',
  (basePath) => {
    const { next } = nextTestSetup({
      files: __dirname,
      env: {
        NEXT_PRIVATE_TEST_HEADERS: '1',
        NEXT_PRIVATE_MINIMAL_MODE: '1',
        TEST_PPR_BASE_PATH: basePath,
      },
    })

    it.each([
      ['/', 'runtime.example/'],
      ['/?nxtPtenant=runtime.example', 'runtime.example/'],
      [`/${placeholders}`, 'runtime.example/'],
      [`/article${placeholders}`, 'runtime.example/article'],
      [`/sites/runtime.example${placeholders}`, 'runtime.example/'],
    ])('resumes %s with concrete route params', async (path, expected) => {
      const { postponed } = await next.readJSON(`.next/server/app${route}.meta`)
      expect(typeof postponed).toBe('string')
      expect(postponed.length).toBeGreaterThan(0)

      // A raw HTTP request preserves the synthetic tenant Host header and carries
      // the postponed state emitted by the production build.
      const url = new URL(basePath + path, next.url)
      if (basePath && url.pathname === basePath + '/') {
        url.pathname = basePath
      }
      const outputIndex = next.cliOutput.length
      const response = await new Promise<{ status?: number; body: string }>(
        (resolve, reject) => {
          const req = request(
            url,
            {
              method: 'POST',
              headers: {
                host: 'runtime.example',
                'next-resume': '1',
                'x-matched-path': route,
                'content-length': Buffer.byteLength(postponed),
              },
              signal: AbortSignal.timeout(10000),
            },
            (res) => {
              let body = ''
              res.setEncoding('utf8')
              res.on('data', (chunk) => {
                body += chunk
              })
              res.on('error', reject)
              res.on('end', () => resolve({ status: res.statusCode, body }))
            }
          )
          req.on('error', reject)
          req.end(postponed)
        }
      )

      expect(response.status).toBe(200)
      expect(response.body).toContain(`<h1>${expected}</h1>`)
      expect(next.cliOutput.slice(outputIndex)).not.toContain(
        'postponed state should not be provided when fallback params are provided'
      )
    })
  }
)
