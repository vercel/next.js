import { retry } from 'next-test-utils'
import { nextTestSetup } from 'e2e-utils'

describe('Document and App - Client side', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  it('should share module state with pages', async () => {
    const browser = await next.browser('/shared')

    const text = await browser.elementByCss('#currentstate').text()
    expect(text).toBe('UPDATED CLIENT')
  })

  if (isNextDev) {
    it('should detect the changes to pages/_app.js and display it', async () => {
      const appPath = 'pages/_app.js'
      const originalContent = await next.readFile(appPath)
      try {
        const browser = await next.browser('/')
        const text = await browser.elementByCss('#hello-hmr').text()
        expect(text).toBe('Hello HMR')

        // change the content
        const editedContent = originalContent.replace('Hello HMR', 'Hi HMR')
        await next.patchFile(appPath, editedContent)

        await retry(async () =>
          expect(await browser.elementByCss('body').text()).toContain('Hi HMR')
        )

        // add the original content
        await next.patchFile(appPath, originalContent)

        await retry(async () =>
          expect(await browser.elementByCss('body').text()).toContain(
            'Hello HMR'
          )
        )
      } finally {
        await next.patchFile(appPath, originalContent)
      }
    })

    it('should detect the changes to pages/_document.js and display it', async () => {
      const appPath = 'pages/_document.js'
      const originalContent = await next.readFile(appPath)
      try {
        const browser = await next.browser('/')
        const text = await browser.elementByCss('#hello-hmr').text()
        expect(text).toBe('Hello HMR')

        const editedContent = originalContent.replace(
          'Hello Document HMR',
          'Hi Document HMR'
        )

        // change the content
        await next.patchFile(appPath, editedContent)

        await retry(async () =>
          expect(await browser.elementByCss('body').text()).toContain(
            'Hi Document HMR'
          )
        )

        // add the original content
        await next.patchFile(appPath, originalContent)

        await retry(async () =>
          expect(await browser.elementByCss('body').text()).toContain(
            'Hello Document HMR'
          )
        )
      } finally {
        await next.patchFile(appPath, originalContent)
      }
    })

    it('should keep state between page navigations', async () => {
      const browser = await next.browser('/')

      const randomNumber = await browser.elementByCss('#random-number').text()

      const switchedRandomNumer = await browser
        .elementByCss('#about-link')
        .click()
        .waitForElementByCss('.page-about')
        .elementByCss('#random-number')
        .text()

      expect(switchedRandomNumer).toBe(randomNumber)
      await browser.close()
    })
  }
})
