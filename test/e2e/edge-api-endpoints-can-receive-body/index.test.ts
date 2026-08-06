import { FileRef, nextTestSetup } from 'e2e-utils'
import { fetchViaHTTP } from 'next-test-utils'
import path from 'path'

describe('Edge API endpoints can receive body', () => {
  const { next } = nextTestSetup({
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
