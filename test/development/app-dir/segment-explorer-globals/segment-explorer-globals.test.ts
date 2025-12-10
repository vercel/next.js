import { nextTestSetup } from 'e2e-utils'
import { getSegmentExplorerContent } from 'next-test-utils'

describe('segment-explorer - globals', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should show global-error segment', async () => {
    const browser = await next.browser('/runtime-error')
    expect(await getSegmentExplorerContent(browser)).toMatchInlineSnapshot(
      `"app/ [global-error.tsx]"`
    )
  })

  it('should display parallel routes default page when present', async () => {
    const browser = await next.browser('/404-not-found')
    expect(await getSegmentExplorerContent(browser)).toMatchInlineSnapshot(
      `"app/ [global-not-found.tsx]"`
    )
  })
})
