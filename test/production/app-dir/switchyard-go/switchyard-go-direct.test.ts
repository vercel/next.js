import { request } from 'http'
import { join } from 'path'
import { FileRef, nextTestSetup } from 'e2e-utils'
import { SWITCHYARD_ENV } from 'next/dist/server/lib/switchyard-env'

// Only self-hosted next start uses Switchyard. Pausing its Node process
// after warming the workers proves direct requests do not need Node to run.
// route.go requires Turbopack, and this suite also needs a switchyard build.
// @force-gate turbopack
// @force-gate switchyardBinary
describe('switchyard-go direct path', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    env: { [SWITCHYARD_ENV]: '1' },
  })
  if (skipped) return

  function received(
    target: string,
    headers: Record<string, string | string[]> = {}
  ): Promise<{
    parentPid: number
    requestURI: string
    params: Record<string, string>
    header: Record<string, string[]>
  }> {
    return new Promise((resolve, reject) => {
      const req = request(
        {
          host: '127.0.0.1',
          port: Number(next.appPort),
          path: target,
          headers,
          // Resume Node in finally if a request unexpectedly needs it.
          signal: AbortSignal.timeout(5000),
        },
        (res) => {
          const chunks: Buffer[] = []
          res.on('data', (chunk: Buffer) => chunks.push(chunk))
          res.on('error', reject)
          res.on('end', () => {
            try {
              expect(res.statusCode).toBe(200)
              resolve(JSON.parse(Buffer.concat(chunks).toString()))
            } catch (error) {
              reject(error)
            }
          })
        }
      )
      req.on('error', reject)
      req.end()
    })
  }

  it('starts the worker on the first request', async () => {
    expect(await received('/go/users/first')).toMatchObject({
      params: { id: 'first' },
      parentPid: expect.any(Number),
    })
  })

  it('sends plain requests directly while Node is paused', async () => {
    // Each route.go has its own worker, started by its first request.
    for (const target of ['/go/users/warm-up', '/go/echo', '/go/files/x']) {
      await received(target)
    }
    const { parentPid } = await received('/go/echo')
    process.kill(parentPid, 'SIGSTOP')
    try {
      for (const target of [
        '/go/users/42?sort=asc',
        '/go/echo',
        // A query already in the form Node writes reaches the worker as sent.
        '/go/echo?q=hello%20world&tags=a%2Cb',
        '/go/files/a/b.txt',
      ]) {
        expect((await received(target)).requestURI).toBe(target)
      }
    } finally {
      process.kill(parentPid, 'SIGCONT')
    }
  })

  it('keeps Node’s URL and header handling', async () => {
    expect((await received('/go/users/a%20b')).params.id).toBe('a b')
    expect((await received('/go/echo?a')).requestURI).toBe('/go/echo?a=')
    const repeated = await received('/go/echo', {
      'User-Agent': ['first', 'second'],
    })
    expect(repeated.header['User-Agent']).toEqual(['first'])
  })
})

// The same app with a basePath: Node's route table carries it, and a direct
// request reaches the worker with the basePath in its URL, as through Node.
// @force-gate turbopack
// @force-gate switchyardBinary
describe('switchyard-go direct path with a basePath', () => {
  const { next, skipped } = nextTestSetup({
    files: {
      app: new FileRef(join(__dirname, 'app')),
      internal: new FileRef(join(__dirname, 'internal')),
      pages: new FileRef(join(__dirname, 'pages')),
      'go.mod': new FileRef(join(__dirname, 'go.mod')),
      'next.config.ts': `
        import type { NextConfig } from 'next'
        const nextConfig: NextConfig = {
          basePath: '/docs',
          experimental: { goRoutes: true },
          compress: false,
        }
        export default nextConfig
      `,
    },
    skipDeployment: true,
    env: { [SWITCHYARD_ENV]: '1' },
  })
  if (skipped) return

  async function received(target: string) {
    // Resume Node in finally if a request unexpectedly needs it.
    const res = await next.fetch(target, { signal: AbortSignal.timeout(5000) })
    expect(res.status).toBe(200)
    return res.json()
  }

  it('sends requests under the basePath directly while Node is paused', async () => {
    for (const target of ['/docs/go/users/warm-up', '/docs/go/echo']) {
      await received(target)
    }
    const { parentPid } = await received('/docs/go/echo')
    process.kill(parentPid, 'SIGSTOP')
    try {
      expect(await received('/docs/go/users/42?sort=asc')).toMatchObject({
        requestURI: '/docs/go/users/42?sort=asc',
        params: { id: '42' },
      })
      expect((await received('/docs/go/echo')).requestURI).toBe('/docs/go/echo')
    } finally {
      process.kill(parentPid, 'SIGCONT')
    }
  })

  it('leaves paths outside the basePath to Node', async () => {
    expect((await next.fetch('/go/echo')).status).toBe(404)
  })
})
