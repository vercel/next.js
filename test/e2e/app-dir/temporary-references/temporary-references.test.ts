import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('temporary-references', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // FIXME: the react patch i did to fix iterators and enable encode-decode-encode breaks this test,
  // because it essentially disabled passing the same objects back
  // (which is undesirable for iterators)
  it.failing.each(['edge', 'node'])(
    'should return the same object that was sent to the action (%s)',
    async (runtime) => {
      const browser = await next.browser('/' + runtime)
      // eslint-disable-next-line jest/no-standalone-expect
      expect(await browser.elementByCss('p').text()).toBe('initial')

      await browser.elementByCss('button').click()

      await retry(async () => {
        expect(await browser.elementByCss('p').text()).toBe('identical')
      })
    }
  )
})
