import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('prerender indicator', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should have prerender-indicator by default for static page', async () => {
    const browser = await next.browser('/')

    await retry(async () => {
      const classNames = await browser.eval(() => [
        ...document
          .querySelector('#__next-prerender-indicator')
          .shadowRoot.querySelector('#container')
          .classList.values(),
      ])
      expect(classNames).toEqual(['visible'])
    })
  })

  it('should hide the indicator when changing to dynamic', async () => {
    const browser = await next.browser('/')
    const origContent = await next.readFile('app/page.tsx')

    await next.patchFile(
      'app/page.tsx',
      origContent.replace('// headers()', 'headers()')
    )

    try {
      await retry(async () => {
        const classNames = await browser.eval(() => [
          ...document
            .querySelector('#__next-prerender-indicator')
            .shadowRoot.querySelector('#container')
            .classList.values(),
        ])

        expect(classNames).toEqual([])
      })
    } finally {
      await next.patchFile('app/page.tsx', origContent)
    }
  })

  it('should not have the indicator on dynamic page on load', async () => {
    const origContent = await next.readFile('app/page.tsx')

    await next.patchFile(
      'app/page.tsx',
      origContent.replace('// headers()', 'headers()')
    )

    const browser = await next.browser('/')

    try {
      await retry(async () => {
        const classNames = await browser.eval(() => [
          ...document
            .querySelector('#__next-prerender-indicator')
            .shadowRoot.querySelector('#container')
            .classList.values(),
        ])
        expect(classNames).toEqual([])
      })
    } finally {
      await next.patchFile('app/page.tsx', origContent)
    }
  })

  it('should not show the indicator if disabled in next.config', async () => {
    await next.stop()

    await next.patchFile(
      'next.config.js',
      `
      module.exports = {
        devIndicators: {
          appIsrStatus: false
        }
      }
    `
    )

    try {
      await next.start()
      const browser = await next.browser('/')

      const classNames = await browser.eval(() => [
        ...document
          .querySelector('#__next-prerender-indicator')
          .shadowRoot.querySelector('#container')
          .classList.values(),
      ])
      expect(classNames).toEqual([])
    } finally {
      await next.deleteFile('app/page.tsx')
    }
  })
})
