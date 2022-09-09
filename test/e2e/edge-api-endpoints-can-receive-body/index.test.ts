import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { fetchViaHTTP } from 'next-test-utils'
import path from 'path'

describe('Edge API endpoints can receive body', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        'pages/api/edge.js': new FileRef(
          path.resolve(__dirname, './app/pages/api/edge.js')
        ),
        'pages/api/index.js': new FileRef(
          path.resolve(__dirname, './app/pages/api/index.js')
        ),
      },
      dependencies: {},
    })
  })
  afterAll(() => next.destroy())

  it('reads the body as text', async () => {
    const res = await fetchViaHTTP(
      next.url,
      '/api/edge',
      {},
      {
        body: 'hello, world.',
        method: 'POST',
      }
    )

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('got: hello, world.')
  })

  it('reads the body from index', async () => {
    const res = await fetchViaHTTP(
      next.url,
      '/api',
      {},
      {
        body: 'hello, world.',
        method: 'POST',
      }
    )

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('got: hello, world.')
  })
})
