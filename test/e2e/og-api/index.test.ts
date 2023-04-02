import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { fetchViaHTTP, renderViaHTTP } from 'next-test-utils'
import fs from 'fs-extra'
import { join } from 'path'

describe('og-api', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: new FileRef(join(__dirname, 'app')),
      dependencies: {
        '@vercel/og': 'latest',
      },
    })
  })
  afterAll(() => next.destroy())

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

  it('should work in app route in node runtime', async () => {
    const res = await fetchViaHTTP(next.url, '/og-node')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('image/png')
    const body = await res.blob()
    expect(body.size).toBeGreaterThan(0)
  })

  if ((global as any).isNextStart) {
    it('should copy files correctly', async () => {
      expect(next.cliOutput).not.toContain('Failed to copy traced files')

      expect(
        await fs.pathExists(
          join(next.testDir, '.next/standalone/.next/server/pages/api/og.js')
        )
      ).toBe(true)
      expect(
        await fs.pathExists(
          join(next.testDir, '.next/standalone/.next/server/edge-chunks')
        )
      ).toBe(true)
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
