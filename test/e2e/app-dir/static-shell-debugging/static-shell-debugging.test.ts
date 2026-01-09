import { nextTestSetup } from 'e2e-utils'

describe('static-shell-debugging', () => {
  // TODO: The static shell debugging feature (__nextppronly) needs to be
  // reimplemented for the cacheComponents architecture. The feature was
  // previously tied to the PPR render path which has been consolidated.
  // For now, this test verifies the basic page rendering works correctly.
  // When the feature is reimplemented, re-enable the static shell assertions.

  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) return

  it('should render the full page', async () => {
    const res = await next.fetch('/')
    expect(res.status).toBe(200)

    const html = await res.text()
    expect(html).toContain('Fallback')
    expect(html).toContain('Dynamic')
  })
})
