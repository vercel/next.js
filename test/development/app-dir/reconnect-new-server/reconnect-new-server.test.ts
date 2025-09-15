import { nextTestSetup } from 'e2e-utils'
import { assertNoRedbox } from 'next-test-utils'

describe('reconnect-new-server', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should reconnect to the new server with fresh content', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('p').text()).toBe('hello world')

    // Editing next config will restart the server
    await next.patchFile('next.config.js', (content) =>
      content.replace('hello', 'see you again')
    )

    await assertNoRedbox(browser)

    expect(await browser.elementByCss('p').text()).toBe('see you again world')
  })
})
