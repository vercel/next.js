import { nextTestSetup } from 'e2e-utils'

// Regression test: route group names containing non-Latin-1 characters
// (e.g. `app/(안녕)/hello/page.tsx`) crashed with
// `InvalidCharacterError: Invalid character` because the segment cache key
// was encoded with `btoa`, which only accepts Latin-1 input.
describe('non-ascii-route-group', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should render a page inside a route group with non-ASCII name', async () => {
    const res = await next.fetch('/hello')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('hello from non-ascii route group')
  })
})
