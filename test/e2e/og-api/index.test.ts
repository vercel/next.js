import { FileRef, nextTestSetup } from 'e2e-utils'
import { fetchViaHTTP, renderViaHTTP } from 'next-test-utils'
import { randomUUID } from 'crypto'
import fs from 'fs-extra'
import { join } from 'path'

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// It likely asserts local CLI or runtime output that deploy tests do not expose.
// @force-gate !deploy || !standaloneOutput
describe('og-api', () => {
  const { next } = nextTestSetup({
    files: new FileRef(join(__dirname, 'app')),
  })

  it('should respond from index', async () => {
    const html = await renderViaHTTP(next.url, '/')
    expect(html).toContain('hello world')
  })

  it('should work in pages/api', async () => {
    const res = await fetchViaHTTP(next.url, '/api/og')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('image/png')
    const body = await res.blob()
    expect(body.size).toBeGreaterThan(0)
  })

  it('should work in app route', async () => {
    const res = await fetchViaHTTP(next.url, '/og')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('image/png')
    const body = await res.blob()
    expect(body.size).toBeGreaterThan(0)
  })

  it('should work in app route in node runtime after image optimization', async () => {
    const before = await fetchViaHTTP(next.url, '/og-node')
    expect(before.status).toBe(200)
    expect(before.headers.get('content-type')).toContain('image/png')
    expect((await before.blob()).size).toBeGreaterThan(0)

    const imageUrl = encodeURIComponent(`/pixel/${randomUUID()}`)
    const optimized = await fetchViaHTTP(
      next.url,
      `/_next/image?url=${imageUrl}&w=640&q=75`
    )
    expect(optimized.status).toBe(200)
    expect(
      optimized.headers.get('x-vercel-cache') ||
        optimized.headers.get('x-nextjs-cache')
    ).toBe('MISS')

    const after = await fetchViaHTTP(next.url, '/og-node')
    expect(after.status).toBe(200)
    expect(after.headers.get('content-type')).toContain('image/png')
    expect((await after.blob()).size).toBeGreaterThan(0)
  })

  it('should work in middleware', async () => {
    const res = await fetchViaHTTP(next.url, '/middleware')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('image/png')
    const body = await res.blob()
    expect(body.size).toBeGreaterThan(0)
  })

  if (
    (global as any).isNextStart &&
    process.env.TEST_OUTPUT_STANDALONE === 'true'
  ) {
    it('should copy files correctly', async () => {
      expect(next.cliOutput).not.toContain('Failed to copy traced files')

      let manifest = await fs.readJSON(
        join(
          next.testDir,
          '.next/standalone/.next/server/middleware-manifest.json'
        )
      )
      let apiOg = manifest.functions['/api/og']
      let files = apiOg.files.concat(
        [...apiOg.wasm, ...apiOg.assets].map((f) => f.filePath)
      )

      for (let f of files) {
        expect(
          await fs.pathExists(join(next.testDir, '.next/standalone/.next', f))
        ).toBe(true)
      }
    })
  }

  if ((global as any).isNextDev) {
    it('should throw error when returning a response object in pages/api in node runtime', async () => {
      const res = await fetchViaHTTP(next.url, '/api/og-wrong-runtime')
      expect(res.status).toBe(500)
      expect(await res.text()).toContain(
        `API route returned a Response object in the Node.js runtime, this is not supported.`
      )
    })
  }
})
