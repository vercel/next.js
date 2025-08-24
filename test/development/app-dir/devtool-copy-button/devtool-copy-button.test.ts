import { nextTestSetup } from 'e2e-utils'

describe('app-dir - devtool-copy-button', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: {
      NODE_OPTIONS: '--inspect',
      DEBUG: '1',
    },
  })

  it('should has inspect url copy button', async () => {
    const browser = await next.browser('/')
    expect(
      await browser
        .elementByCss('[data-nextjs-data-runtime-error-copy-devtools-url]')
        .getAttribute('aria-label')
    ).toBe('Copy Chrome DevTools URL')
  })
})
