import { nextTestSetup } from '../../../lib/e2e-utils'
import { retry } from '../../../lib/next-test-utils'

describe('actions', () => {
  const { next } = nextTestSetup({ files: __dirname })
  it('works', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss('button').click()
    await retry(
      async () => {
        expect(await browser.elementById('action-state').text()).toEqual('done')
      },
      undefined,
      undefined,
      'wait for both actions to finish'
    )
  })
})
