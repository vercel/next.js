import { nextTestSetup } from 'e2e-utils'

describe('Error no pageProps', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should load auto-export page correctly', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('#index').text()).toBe('index')
    expect(await browser.eval('window.uncaughtErrors')).toEqual([])
  })

  it('should load getStaticProps page correctly', async () => {
    const browser = await next.browser('/gsp')
    expect(await browser.elementByCss('#gsp').text()).toBe('getStaticProps')
    expect(await browser.eval('window.uncaughtErrors')).toEqual([])
  })

  it('should load getServerSideProps page correctly', async () => {
    const browser = await next.browser('/gssp')
    expect(await browser.elementByCss('#gssp').text()).toBe(
      'getServerSideProps'
    )
    expect(await browser.eval('window.uncaughtErrors')).toEqual([])
  })

  it('should load 404 page correctly', async () => {
    const browser = await next.browser('/non-existent')
    expect(await browser.elementByCss('h2').text()).toBe(
      'Application error: a client-side exception has occurred (see the browser console for more information).'
    )
    expect(await browser.eval('window.uncaughtErrors')).toEqual([])
  })

  it('should navigate between pages correctly', async () => {
    const browser = await next.browser('/')

    await browser.eval('window.beforeNav = "hi"')
    await browser.elementByCss('#to-gsp').click()
    await browser.waitForElementByCss('#gsp')

    expect(await browser.elementByCss('#gsp').text()).toBe('getStaticProps')
    expect(await browser.eval('window.beforeNav')).toBe('hi')

    await browser.back()
    await browser.waitForElementByCss('#index')
    expect(await browser.eval('window.beforeNav')).toBe('hi')

    await browser.elementByCss('#to-gssp').click()
    await browser.waitForElementByCss('#gssp')

    expect(await browser.elementByCss('#gssp').text()).toBe(
      'getServerSideProps'
    )
    expect(await browser.eval('window.beforeNav')).toBe('hi')

    await browser.back()
    await browser.waitForElementByCss('#index')
    expect(await browser.eval('window.beforeNav')).toBe('hi')

    await browser.elementByCss('#to-404').click()
    await browser.waitForElementByCss('h2')
    expect(await browser.eval('window.beforeNav')).toBeFalsy()
    expect(await browser.elementByCss('h2').text()).toBe(
      'Application error: a client-side exception has occurred (see the browser console for more information).'
    )
    expect(await browser.eval('window.uncaughtErrors')).toEqual([])
  })
})
