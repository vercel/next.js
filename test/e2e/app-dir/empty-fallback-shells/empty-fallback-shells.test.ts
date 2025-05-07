import { nextTestSetup } from 'e2e-utils'

describe('empty-fallback-shells', () => {
  const { next, isNextDeploy } = nextTestSetup({
    files: __dirname,
  })

  it('should start and not postpone the response', async () => {
    const res = await next.fetch('/world')
    const html = await res.text()
    expect(html).toContain('hello-world')

    if (isNextDeploy) {
      expect(res.headers.get('x-matched-path')).toBe('/[slug]')
    }

    // If we didn't use the fallback shell, then we didn't postpone the response
    // and therefore shouldn't have sent the postponed header.
    expect(res.headers.get('x-nextjs-postponed')).not.toBe('1')
  })
})
