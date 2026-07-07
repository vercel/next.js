import { nextTestSetup } from 'e2e-utils'
import { getRedboxHeader, waitForRedbox } from 'next-test-utils'

describe('next/image with output export config', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should error', async () => {
    const browser = await next.browser('/')
    const msg =
      "Image Optimization using the default loader is not compatible with `{ output: 'export' }`."
    await waitForRedbox(browser)
    expect(await getRedboxHeader(browser)).toContain(msg)
    expect(next.cliOutput).toContain(msg)
  })
})
