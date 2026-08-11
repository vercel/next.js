import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('optimize-package-imports-local-barrel', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })
  if (skipped) return

  if (!isNextDev) {
    it('is only applicable in development mode', () => {})
    return
  }

  beforeAll(() => next.start())

  it('invalidates an optimized local barrel when its exports change', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('#button').text()).toBe('button')

    await next.patchFile(
      'ui/index.ts',
      `export { CounterButton as Button } from './CounterButton'\n`
    )

    await retry(async () => {
      expect(await browser.elementByCss('#button').text()).toBe('counter')
    })
  })
})
