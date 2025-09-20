import { nextTestSetup } from 'e2e-utils'

// This test is intended fail in this commit (before the fix) because the local
// not-found.tsx component will not be used when notFound() is called inside
// the layout body

describe('app dir - not-found layout body boundary', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('renders the segment-level custom not-found.tsx component when notFound() is thrown inside a layout body (not children)', async () => {
    const browser = await next.browser('/nested')

    // Expect route segment not-found to have handled the throw.
    const local = await browser.elementById('local-not-found')

    expect(local).not.toBeNull()
  })
})
