/* eslint-disable jest/no-standalone-expect */
import { nextTestSetup, isNextDev } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('nested index.js', () => {
  const { next, isTurbopack, skipped } = nextTestSetup({
    files: __dirname,
    // Vercel's deploy infrastructure normalizes nested `/index/index/index`
    // paths differently from Next.js's local server, so the routing
    // assertions here are local-only.
    skipDeployment: true,
  })
  if (skipped) return

  it('should ssr page /', async () => {
    const $ = await next.render$('/')
    expect($('#page').text()).toBe('index')
  })

  it('should client render page /', async () => {
    const browser = await next.browser('/')
    const text = await browser.elementByCss('#page').text()
    expect(text).toBe('index')
  })

  it('should follow link to /', async () => {
    const browser = await next.browser('/links')
    await browser.elementByCss('#link1').click()
    await retry(async () => {
      const text = await browser.elementByCss('#page').text()
      expect(text).toBe('index')
    })
  })

  it('should ssr page /index', async () => {
    const $ = await next.render$('/index')
    expect($('#page').text()).toBe('index > index')
  })

  // pages named "index" are never hydrated in Webpack during development
  ;(isNextDev && !isTurbopack ? it.failing : it)(
    'should client render page /index',
    async () => {
      const browser = await next.browser('/index')
      const text = await browser.elementByCss('#page').text()
      expect(text).toBe('index > index')
    }
  )

  it('should follow link to /index', async () => {
    const browser = await next.browser('/links')
    await browser.elementByCss('#link2').click()
    await retry(async () => {
      const text = await browser.elementByCss('#page').text()
      expect(text).toBe('index > index')
    })
  })

  it('should ssr page /index/user', async () => {
    const $ = await next.render$('/index/user')
    expect($('#page').text()).toBe('index > user')
  })

  // pages named "index" are never hydrated in Webpack during development
  ;(isNextDev && !isTurbopack ? it.failing : it)(
    'should client render page /index/user',
    async () => {
      const browser = await next.browser('/index/user')
      const text = await browser.elementByCss('#page').text()
      expect(text).toBe('index > user')
    }
  )

  it('should follow link to /index/user', async () => {
    const browser = await next.browser('/links')
    await browser.elementByCss('#link5').click()
    await retry(async () => {
      const text = await browser.elementByCss('#page').text()
      expect(text).toBe('index > user')
    })
  })

  it('should ssr page /index/project', async () => {
    const $ = await next.render$('/index/project')
    expect($('#page').text()).toBe('index > project')
  })

  // pages named "index" are never hydrated in Webpack during development
  ;(isNextDev && !isTurbopack ? it.failing : it)(
    'should client render page /index/project',
    async () => {
      const browser = await next.browser('/index/project')
      const text = await browser.elementByCss('#page').text()
      expect(text).toBe('index > project')
    }
  )

  it('should follow link to /index/project', async () => {
    const browser = await next.browser('/links')
    await browser.elementByCss('#link6').click()
    await retry(async () => {
      const text = await browser.elementByCss('#page').text()
      expect(text).toBe('index > project')
    })
  })

  it('should ssr page /index/index', async () => {
    const $ = await next.render$('/index/index')
    expect($('#page').text()).toBe('index > index > index')
  })

  // pages named "index" are never hydrated in Webpack during development
  ;(isNextDev && !isTurbopack ? it.failing : it)(
    'should client render page /index/index',
    async () => {
      const browser = await next.browser('/index/index')
      const text = await browser.elementByCss('#page').text()
      expect(text).toBe('index > index > index')
    }
  )

  it('should follow link to /index/index', async () => {
    const browser = await next.browser('/links')
    await browser.elementByCss('#link3').click()
    await retry(async () => {
      const text = await browser.elementByCss('#page').text()
      expect(text).toBe('index > index > index')
    })
  })

  it('should 404 on /index/index/index', async () => {
    const response = await next.fetch('/index/index/index')
    expect(response.status).toBe(404)
  })

  it('should not find a link to /index/index/index', async () => {
    const browser = await next.browser('/links')
    await browser.elementByCss('#link4').click()
    await retry(async () => {
      const text = await browser.elementByCss('h1').text()
      expect(text).toMatch(/404/)
    })
  })
})
