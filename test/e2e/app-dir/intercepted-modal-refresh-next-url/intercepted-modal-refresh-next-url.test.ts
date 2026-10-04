import { nextTestSetup } from 'e2e-utils'
import { check, retry } from 'next-test-utils'

describe('intercepted modal refresh Next-Url', () => {
  const { next } = nextTestSetup({ files: __dirname })

  it.each([
    { background: '/photo', label: 'interceptable page' },
    { background: '/plain', label: 'page without an interception route' },
  ])(
    'keeps the $label in place after router.refresh()',
    async ({ background }) => {
      const browser = await next.browser(background)
      const originalDocumentStamp = await browser
        .elementById('document-stamp')
        .text()
      const originalBackgroundRender = await browser
        .elementById('background-render')
        .text()

      await browser.elementByCss("[href='/settings']").click()
      await check(
        () => browser.hasElementByCssSelector('#settings-modal'),
        true
      )

      await browser.elementById('refresh').click()

      await retry(async () => {
        expect(await browser.elementById('document-stamp').text()).toBe(
          originalDocumentStamp
        )
        expect(await browser.elementById('background-title').text()).toBe(
          background === '/photo' ? 'Photo PAGE' : 'Plain PAGE'
        )
        expect(await browser.elementById('settings-modal').text()).toContain(
          'Settings MODAL'
        )
        expect(await browser.elementById('background-render').text()).not.toBe(
          originalBackgroundRender
        )
      })
    }
  )

  it('keeps an interceptable page in place after a Server Action revalidates it', async () => {
    const browser = await next.browser('/photo')
    const originalDocumentStamp = await browser
      .elementById('document-stamp')
      .text()

    await browser.elementByCss("[href='/settings']").click()
    await check(() => browser.hasElementByCssSelector('#settings-modal'), true)
    await browser.elementById('revalidate').click()

    await retry(async () => {
      expect(await browser.elementById('document-stamp').text()).toBe(
        originalDocumentStamp
      )
      expect(await browser.elementById('background-title').text()).toBe(
        'Photo PAGE'
      )
      expect(await browser.elementById('settings-modal').text()).toContain(
        'Settings MODAL'
      )
    })
  })
})
