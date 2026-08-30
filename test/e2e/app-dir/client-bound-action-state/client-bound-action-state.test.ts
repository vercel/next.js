import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('client-bound-action-state', () => {
  const { next, isNextDeploy } = nextTestSetup({
    files: __dirname,
  })

  it('should return useActionState after a no-JS submit of a client-bound Server Function', async () => {
    const browser = await next.browser('/', {
      disableJavaScript: true,
    })
    const cliOutputLength = next.cliOutput.length

    await browser.elementById('client-bound-submit').click()

    if (!isNextDeploy) {
      await retry(() => {
        expect(next.cliOutput.slice(cliOutputLength)).toContain(
          '[client-bound-action-state] Updated client-user to Ada'
        )
      })
    }

    await retry(async () => {
      expect(await browser.elementById('client-bound-state').text()).toBe(
        'Updated client-user to Ada'
      )
    })
  })

  it('should return useActionState after a no-JS submit of a server-bound Server Function', async () => {
    const browser = await next.browser('/server-bind', {
      disableJavaScript: true,
    })

    await browser.elementById('server-bound-submit').click()

    await retry(async () => {
      expect(await browser.elementById('server-bound-state').text()).toBe(
        'Updated server-user to Ada'
      )
    })
  })

  it('should return useActionState after a client-bound submit with JS', async () => {
    const browser = await next.browser('/')

    await browser.elementById('client-bound-submit').click()

    await retry(async () => {
      expect(await browser.elementById('client-bound-state').text()).toBe(
        'Updated client-user to Ada'
      )
    })
  })
})
