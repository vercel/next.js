import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { fetchViaHTTP, renderViaHTTP } from 'next-test-utils'
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

  it('should work', async () => {
    const res = await fetchViaHTTP(next.url, '/api/og')
    expect(res.status).toBe(200)
    const body = await res.blob()
    expect(body.size).toBeGreaterThan(0)
  })
})
