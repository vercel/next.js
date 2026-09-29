import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { randomUUID } from 'node:crypto'

describe('app-dir - draft-mode-middleware', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    captureRuntimeLogs: true,
  })

  it('should be able to enable draft mode with middleware present', async () => {
    const browser = await next.browser(
      '/api/draft?secret=secret-token&slug=preview-page'
    )
    const requestId = randomUUID()
    await browser.loadPage(
      new URL(`/preview-page?requestId=${requestId}`, next.url).toString()
    )

    await retry(async () => {
      expect(next.cliOutput).toContain(
        `[${requestId}] draftMode().isEnabled from middleware: true`
      )
    }, 30_000)

    const draftText = await browser.elementByCss('h1').text()
    expect(draftText).toBe('draft')
  })

  it('should be able to disable draft mode with middleware present', async () => {
    const browser = await next.browser(
      '/api/draft?secret=secret-token&slug=preview-page'
    )
    expect(await browser.elementByCss('h1').text()).toBe('draft')
    await browser.loadPage(new URL('/api/disable-draft', next.url).toString())
    const requestId = randomUUID()
    await browser.loadPage(
      new URL(`/preview-page?requestId=${requestId}`, next.url).toString()
    )
    await retry(async () => {
      expect(next.cliOutput).toContain(
        `[${requestId}] draftMode().isEnabled from middleware: false`
      )
    }, 30_000)

    const draftText = await browser.elementByCss('h1').text()
    expect(draftText).toBe('none')
  })
})
