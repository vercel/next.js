import { FileRef, nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { join } from 'path'

const isNodeMiddleware = process.env.TEST_NODE_MIDDLEWARE === 'true'

describe(`app-dir - draft-mode-middleware-${isNodeMiddleware ? 'node' : 'edge'}`, () => {
  const { next, skipped } = nextTestSetup({
    files: {
      app: new FileRef(join(__dirname, 'app')),
      'middleware.ts': new FileRef(
        join(
          __dirname,
          isNodeMiddleware ? 'middleware-node.ts' : 'middleware-edge.ts'
        )
      ),
      'middleware-edge.ts': new FileRef(join(__dirname, 'middleware-edge.ts')),
    },
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
