import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('resolve-client-references-in-server-actions', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should resolve client references in server actions', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss('button').click()

    await retry(() => {
      expect(next.cliOutput).toInclude('POST / 200')
    })

    expect(next.cliOutput).not.toInclude('Could not find the module')
  })
})
