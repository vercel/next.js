import { nextTestSetup } from 'e2e-utils'

describe('Compression', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should compress responses by default', async () => {
    const res = await next.fetch('/')

    expect(res.headers.get('content-encoding')).toMatch(/gzip/)
  })
})
