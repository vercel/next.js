import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('scrolling into a newly mounted nested layout', () => {
  const { next } = nextTestSetup({ files: __dirname })

  const open = (path: string) =>
    next.browser(path, {
      beforePageLoad: async (page) => {
        await page.setViewportSize({ width: 1280, height: 800 })
      },
    })

  it.each(['to-section', 'to-section-no-prefetch'])(
    'keeps the heading of a newly mounted layout visible using %s',
    async (linkId) => {
      const browser = await open('/')
      await browser.elementById(linkId).click()
      await browser.waitForElementByCss('#page-content')
      expect(await browser.elementById('page-name').text()).toBe('Section page')
      await retry(async () => {
        expect(await browser.eval('window.scrollY')).toBe(0)
        expect(
          await browser.eval(
            'document.getElementById("section-header").getBoundingClientRect().top'
          )
        ).toBe(0)
      })
    }
  )

  it('keeps identical content in a flat page visible', async () => {
    const browser = await open('/')
    await browser.elementById('to-flat').click()
    expect(await browser.elementById('page-name').text()).toBe('Flat page')
    await retry(async () => {
      expect(await browser.eval('window.scrollY')).toBe(0)
    })
  })

  it('still scrolls to the new page inside an already mounted layout', async () => {
    const browser = await open('/section')
    await browser.eval(
      'window.originalHeader = document.getElementById("section-header")'
    )
    await browser.elementById('to-other').click()
    await retry(async () => {
      expect(await browser.elementById('page-name').text()).toBe('Other page')
      expect(
        await browser.eval(
          'document.getElementById("page-content").getBoundingClientRect().top'
        )
      ).toBe(0)
    })
    expect(
      await browser.eval(
        'window.originalHeader === document.getElementById("section-header")'
      )
    ).toBe(true)
  })

  it('respects scroll=false when entering a new layout', async () => {
    const browser = await open('/')
    await browser.eval('window.scrollTo(0, 150)')
    expect(await browser.eval('window.scrollY')).toBe(150)
    await browser.eval(
      'document.getElementById("to-section-no-scroll").click()'
    )
    await retry(async () => {
      expect(await browser.elementById('page-name').text()).toBe('Section page')
      expect(await browser.eval('window.scrollY')).toBe(150)
    })
  })

  it('respects anchors when entering a new layout', async () => {
    const browser = await open('/')
    await browser.elementById('to-section-anchor').click()
    await retry(async () => {
      expect(await browser.elementById('page-name').text()).toBe('Section page')
      expect(
        await browser.eval(
          'document.getElementById("target").getBoundingClientRect().top'
        )
      ).toBe(0)
    })
  })
})
