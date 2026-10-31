import { nextTestSetup, isNextStart } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('href resolving trailing-slash', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should route to /blog/another/ correctly', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss('#to-blog-another').click()

    await browser.waitForElementByCss('#another')
    expect(await browser.elementByCss('#another').text()).toBe('blog another')
  })

  it('should route to /blog/first-post/ correctly', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss('#to-blog-post').click()

    await browser.waitForElementByCss('#slug')
    expect(await browser.elementByCss('#slug').text()).toBe(
      'blog slug first-post'
    )
  })

  it('should route to /catch-all/hello/world/ correctly', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss('#to-catch-all-item').click()

    await browser.waitForElementByCss('#slug')
    expect(await browser.elementByCss('#slug').text()).toBe(
      'catch-all slug hello/world'
    )
  })

  it('should route to /catch-all/first/ correctly', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss('#to-catch-all-first').click()

    await browser.waitForElementByCss('#first')
    expect(await browser.elementByCss('#first').text()).toBe('catch-all first')
  })

  it('should route to /another/ correctly', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss('#to-another').click()

    await browser.waitForElementByCss('#another')
    expect(await browser.elementByCss('#another').text()).toBe(
      'top level another'
    )
  })

  it('should route to /top-level-slug/ correctly', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss('#to-slug').click()

    await browser.waitForElementByCss('#slug')
    expect(await browser.elementByCss('#slug').text()).toBe(
      'top level slug top-level-slug'
    )
  })

  if (isNextStart) {
    it('should preload SSG routes correctly', async () => {
      const browser = await next.browser('/')

      await retry(async () => {
        const hrefs: string[] = await browser.eval(
          `Object.keys(window.next.router.sdc)`
        )
        hrefs.sort()

        expect(
          hrefs.map((href) =>
            new URL(href).pathname.replace(/^\/_next\/data\/[^/]+/, '')
          )
        ).toEqual(['/top-level-slug.json', '/world.json'])
      })
    })
  }
})
