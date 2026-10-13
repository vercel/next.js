import { nextTestSetup } from 'e2e-utils'

describe('rewrite-headers with basePath', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('emits a basePath-free x-nextjs-rewritten-path for config rewrites (RSC)', async () => {
    const res = await next.fetch('/docs/r/alpha', {
      headers: { rsc: '1' },
      redirect: 'manual',
    })
    // The client parses route params from this header, and route paths never
    // include the basePath. Previously this was '/docs/team/alpha', shifting
    // every dynamic param by one segment.
    expect(res.headers.get('x-nextjs-rewritten-path')).toBe('/team/alpha')
  })

  it('emits no rewrite headers for a direct hit', async () => {
    const res = await next.fetch('/docs/team/alpha', {
      headers: { rsc: '1' },
      redirect: 'manual',
    })
    expect(res.headers.get('x-nextjs-rewritten-path')).toBeNull()
  })
})
