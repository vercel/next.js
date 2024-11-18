import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('app-dir - draft-mode-middleware', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should be able to enable draft mode with middleware present', async () => {
    const browser = await next.browser(
      '/api/draft?secret=secret-token&slug=preview-page'
    )

    await retry(async () => {
      expect(next.cliOutput).toContain(
        'draftMode().isEnabled from middleware: true'
      )
    })

    await browser.loadPage(new URL('/preview-page', next.url).toString())
    const draftText = await browser.elementByCss('h1').text()
    expect(draftText).toBe('draft')
  })

  it('should be able to disable draft mode with middleware present', async () => {
    const browser = await next.browser('/api/disable-draft')
    await retry(async () => {
      expect(next.cliOutput).toContain(
        'draftMode().isEnabled from middleware: false'
      )
    })

    await browser.loadPage(new URL('/preview-page', next.url).toString())
    const draftText = await browser.elementByCss('h1').text()
    expect(draftText).toBe('none')
  })
})
