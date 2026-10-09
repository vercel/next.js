import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

const expected =
  'child:client-and-worker:worker-only:ping|parent:client-and-worker:worker-only:via-worker1'

describe('self-referencing web workers', () => {
  const { next } = nextTestSetup({ files: __dirname })

  for (const [kind, button] of [
    ['co-located', '#inline'],
    ['separate module', '#separate'],
  ] as const) {
    it(`roundtrips through a self-spawning ${kind} worker`, async () => {
      const browser = await next.browser('/')
      expect(await browser.elementByCss('#shared').text()).toBe(
        'client-and-worker'
      )
      expect(await browser.elementByCss('#response').text()).toBe('idle')

      await browser.elementByCss(button).click()
      await retry(async () => {
        expect(await browser.elementByCss('#response').text()).toBe(expected)
      })
    })
  }
})
