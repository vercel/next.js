import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// In dev, Turbopack compiles an SSR-free variant on soft navigations; navigation
// and rendering must stay correct. Webpack always renders SSR, so it must behave
// identically.
describe('app dir - dev skip ssr on navigation', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('server-renders the initial page as full HTML', async () => {
    const $ = await next.render$('/')
    expect($('#home-heading').text()).toBe('Home page')
    expect($('#home-button').text()).toContain('home count: 0')
    expect($('html').length).toBe(1)
  })

  it('hydrates and keeps Client Components interactive', async () => {
    const browser = await next.browser('/')
    await browser.elementById('home-button').click()
    await retry(async () => {
      expect(await browser.elementById('home-button').text()).toContain(
        'home count: 1'
      )
    })
  })

  it('soft-navigates to another route and renders it correctly', async () => {
    const browser = await next.browser('/')
    await browser.elementById('to-other').click()

    await retry(async () => {
      expect(await browser.elementById('other-heading').text()).toBe(
        'Other page'
      )
    })
    expect(await browser.elementById('other-text').text()).toBe(
      'server rendered text on other'
    )

    await browser.elementById('other-button').click()
    await retry(async () => {
      expect(await browser.elementById('other-button').text()).toContain(
        'other count: 1'
      )
    })
  })

  it('hard-loads a route that was previously only soft-navigated with full SSR HTML', async () => {
    // Soft-navigate first so the route is compiled via the SSR-free variant.
    const browser = await next.browser('/')
    await browser.elementById('to-other').click()
    await retry(async () => {
      expect(await browser.elementById('other-heading').text()).toBe(
        'Other page'
      )
    })

    // The hard load must still return full SSR HTML (compiles the full endpoint).
    const $ = await next.render$('/other')
    expect($('#other-heading').text()).toBe('Other page')
    expect($('#other-text').text()).toBe('server rendered text on other')
    expect($('#other-button').text()).toContain('other count: 0')
    expect($('html').length).toBe(1)
  })
})
