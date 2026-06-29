import { nextTestSetup } from 'e2e-utils'
import { brotliCompressSync, gzipSync, deflateSync } from 'node:zlib'

describe('resume-content-encoding', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    env: {
      NEXT_PRIVATE_TEST_HEADERS: '1',
      NEXT_PRIVATE_MINIMAL_MODE: '1',
    },
  })

  if (isNextDev || skipped) {
    it.skip('only testable in production (non-deployment)', () => {})
    return
  }

  async function getPostponedState() {
    const { postponed } = await next.readJSON('.next/server/app/index.meta')
    expect(postponed).toEqual(expect.any(String))
    expect(postponed.length).toBeGreaterThan(0)
    return postponed as string
  }

  it('resumes with uncompressed body', async () => {
    const postponed = await getPostponedState()
    const res = await next.fetch('/', {
      method: 'POST',
      headers: {
        'next-resume': '1',
        'x-matched-path': '/',
      },
      body: postponed,
    })

    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('static shell')
    expect(html).toContain('dynamic:')
  })

  it('decompresses gzip body with explicit Content-Encoding: gzip', async () => {
    const postponed = await getPostponedState()
    const compressed = gzipSync(Buffer.from(postponed, 'utf-8'))
    const res = await next.fetch('/', {
      method: 'POST',
      headers: {
        'content-encoding': 'gzip',
        'next-resume': '1',
        'x-matched-path': '/',
      },
      body: compressed,
    })

    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('static shell')
    expect(html).toContain('dynamic:')
  })

  it('decompresses gzip body without Content-Encoding via magic header detection', async () => {
    const postponed = await getPostponedState()
    const compressed = gzipSync(Buffer.from(postponed, 'utf-8'))
    const res = await next.fetch('/', {
      method: 'POST',
      headers: {
        'next-resume': '1',
        'x-matched-path': '/',
      },
      body: compressed,
    })

    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('static shell')
    expect(html).toContain('dynamic:')
  })

  it('decompresses deflate body with explicit Content-Encoding: deflate', async () => {
    const postponed = await getPostponedState()
    const compressed = deflateSync(Buffer.from(postponed, 'utf-8'))
    const res = await next.fetch('/', {
      method: 'POST',
      headers: {
        'content-encoding': 'deflate',
        'next-resume': '1',
        'x-matched-path': '/',
      },
      body: compressed,
    })

    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('static shell')
    expect(html).toContain('dynamic:')
  })

  it('decompresses brotli body with explicit Content-Encoding: br', async () => {
    const postponed = await getPostponedState()
    const compressed = brotliCompressSync(Buffer.from(postponed, 'utf-8'))
    const res = await next.fetch('/', {
      method: 'POST',
      headers: {
        'content-encoding': 'br',
        'next-resume': '1',
        'x-matched-path': '/',
      },
      body: compressed,
    })

    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('static shell')
    expect(html).toContain('dynamic:')
  })
})
