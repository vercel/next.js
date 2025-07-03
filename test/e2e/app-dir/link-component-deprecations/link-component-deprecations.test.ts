import { nextTestSetup, isNextDev } from 'e2e-utils'

describe('Link component deprecations', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('logs deprecation warning for legacyBehavior prop', async () => {
    const browser = await next.browser('/')
    const logs = await browser.log()

    const errors = logs.filter(
      (log) =>
        log.source === 'error' &&
        log.message.includes(
          '`legacyBehavior` is deprecated and will be removed in a future release.'
        )
    )

    expect(errors.length).toBe(isNextDev ? 1 : 0)
  })
})
