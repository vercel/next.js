import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { fetchViaHTTP, renderViaHTTP } from 'next-test-utils'
import path from 'path'
import cheerio from 'cheerio'
import webdriver from 'next-webdriver'

const isDev = (global as any).isNextDev

describe('views dir', () => {
  if ((global as any).isNextDeploy) {
    it('should skip next deploy for now', () => {})
    return
  }

  if (process.env.NEXT_TEST_REACT_VERSION === '^17') {
    it('should skip for react v17', () => {})
    return
  }
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        public: new FileRef(path.join(__dirname, 'app/public')),
        pages: new FileRef(path.join(__dirname, 'app/pages')),
        app: new FileRef(path.join(__dirname, 'app/app')),
        'next.config.js': new FileRef(
          path.join(__dirname, 'app/next.config.js')
        ),
      },
    })
  })
  afterAll(() => next.destroy())

  it('should pass props from getServerSideProps in root layout', async () => {
    const html = await renderViaHTTP(next.url, '/dashboard')
    const $ = cheerio.load(html)
    expect($('title').text()).toBe('hello world')
  })

  it('should serve from pages', async () => {
    const html = await renderViaHTTP(next.url, '/')
    expect(html).toContain('hello from pages/index')
  })

  it('should serve dynamic route from pages', async () => {
    const html = await renderViaHTTP(next.url, '/blog/first')
    expect(html).toContain('hello from pages/blog/[slug]')
  })

  it('should serve from public', async () => {
    const html = await renderViaHTTP(next.url, '/hello.txt')
    expect(html).toContain('hello world')
  })

  it('should serve from app', async () => {
    const html = await renderViaHTTP(next.url, '/dashboard')
    expect(html).toContain('hello from app/dashboard')
  })

  it('should serve /index as separate page', async () => {
    const html = await renderViaHTTP(next.url, '/dashboard/index')
    expect(html).toContain('hello from app/dashboard/index')
  })

  it('should load chunks generated via async import correctly', async () => {
    const html = await renderViaHTTP(next.url, '/dashboard/index')
    expect(html).toContain('hello from lazy')
  })

  it('should include layouts when no direct parent layout', async () => {
    const html = await renderViaHTTP(next.url, '/dashboard/integrations')
    const $ = cheerio.load(html)
    // Should not be nested in dashboard
    expect($('h1').text()).toBe('Dashboard')
    // Should include the page text
    expect($('p').text()).toBe('hello from app/dashboard/integrations')
  })

  it('should not include parent when not in parent directory with route in directory', async () => {
    const html = await renderViaHTTP(next.url, '/dashboard/hello')
    const $ = cheerio.load(html)

    // new root has to provide it's own custom root layout or the default
    // is used instead
    expect(html).toContain('<html>')
    expect(html).toContain('<body>')
    expect($('html').hasClass('this-is-the-document-html')).toBeFalsy()
    expect($('body').hasClass('this-is-the-document-body')).toBeFalsy()

    // Should not be nested in dashboard
    expect($('h1').text()).toBeFalsy()

    // Should render the page text
    expect($('p').text()).toBe('hello from app/dashboard/rootonly/hello')
  })

  it('should use new root layout when provided', async () => {
    const html = await renderViaHTTP(next.url, '/dashboard/another')
    const $ = cheerio.load(html)

    // new root has to provide it's own custom root layout or the default
    // is used instead
    expect($('html').hasClass('this-is-another-document-html')).toBeTruthy()
    expect($('body').hasClass('this-is-another-document-body')).toBeTruthy()

    // Should not be nested in dashboard
    expect($('h1').text()).toBeFalsy()

    // Should render the page text
    expect($('p').text()).toBe('hello from newroot/dashboard/another')
  })

  it('should not create new root layout when nested (optional)', async () => {
    const html = await renderViaHTTP(
      next.url,
      '/dashboard/deployments/breakdown'
    )
    const $ = cheerio.load(html)

    // new root has to provide it's own custom root layout or the default
    // is used instead
    expect($('html').hasClass('this-is-the-document-html')).toBeTruthy()
    expect($('body').hasClass('this-is-the-document-body')).toBeTruthy()

    // Should be nested in dashboard
    expect($('h1').text()).toBe('Dashboard')
    expect($('h2').text()).toBe('Custom dashboard')

    // Should render the page text
    expect($('p').text()).toBe(
      'hello from app/dashboard/(custom)/deployments/breakdown'
    )
  })

  it('should include parent document when no direct parent layout', async () => {
    const html = await renderViaHTTP(next.url, '/dashboard/integrations')
    const $ = cheerio.load(html)

    expect($('html').hasClass('this-is-the-document-html')).toBeTruthy()
    expect($('body').hasClass('this-is-the-document-body')).toBeTruthy()
  })

  it('should not include parent when not in parent directory', async () => {
    const html = await renderViaHTTP(next.url, '/dashboard/changelog')
    const $ = cheerio.load(html)
    // Should not be nested in dashboard
    expect($('h1').text()).toBeFalsy()
    // Should include the page text
    expect($('p').text()).toBe('hello from app/dashboard/changelog')
  })

  it('should serve nested parent', async () => {
    const html = await renderViaHTTP(next.url, '/dashboard/deployments/123')
    const $ = cheerio.load(html)
    // Should be nested in dashboard
    expect($('h1').text()).toBe('Dashboard')
    // Should be nested in deployments
    expect($('h2').text()).toBe('Deployments hello')
  })

  it('should serve dynamic parameter', async () => {
    const html = await renderViaHTTP(next.url, '/dashboard/deployments/123')
    const $ = cheerio.load(html)
    // Should include the page text with the parameter
    expect($('p').text()).toBe(
      'hello from app/dashboard/deployments/[id]. ID is: 123'
    )
  })

  it('should include document html and body', async () => {
    const html = await renderViaHTTP(next.url, '/dashboard')
    const $ = cheerio.load(html)

    expect($('html').hasClass('this-is-the-document-html')).toBeTruthy()
    expect($('body').hasClass('this-is-the-document-body')).toBeTruthy()
  })

  it('should not serve when layout is provided but no folder index', async () => {
    const res = await fetchViaHTTP(next.url, '/dashboard/deployments')
    expect(res.status).toBe(404)
    expect(await res.text()).toContain('This page could not be found')
  })

  // TODO: do we want to make this only work for /root or is it allowed
  // to work for /pages as well?
  it.skip('should match partial parameters', async () => {
    const html = await renderViaHTTP(next.url, '/partial-match-123')
    expect(html).toContain('hello from app/partial-match-[id]. ID is: 123')
  })

  describe('server components', () => {
    // TODO: why is this not servable but /dashboard+rootonly/hello.server.js
    // should be? Seems like they both either should be servable or not
    it('should not serve .server.js as a path', async () => {
      // Without .server.js should serve
      const html = await renderViaHTTP(next.url, '/should-not-serve-server')
      expect(html).toContain('hello from app/should-not-serve-server')

      // Should not serve `.server`
      const res = await fetchViaHTTP(
        next.url,
        '/should-not-serve-server.server'
      )
      expect(res.status).toBe(404)
      expect(await res.text()).toContain('This page could not be found')

      // Should not serve `.server.js`
      const res2 = await fetchViaHTTP(
        next.url,
        '/should-not-serve-server.server.js'
      )
      expect(res2.status).toBe(404)
      expect(await res2.text()).toContain('This page could not be found')
    })

    it('should not serve .client.js as a path', async () => {
      // Without .client.js should serve
      const html = await renderViaHTTP(next.url, '/should-not-serve-client')
      expect(html).toContain('hello from app/should-not-serve-client')

      // Should not serve `.client`
      const res = await fetchViaHTTP(
        next.url,
        '/should-not-serve-client.client'
      )
      expect(res.status).toBe(404)
      expect(await res.text()).toContain('This page could not be found')

      // Should not serve `.client.js`
      const res2 = await fetchViaHTTP(
        next.url,
        '/should-not-serve-client.client.js'
      )
      expect(res2.status).toBe(404)
      expect(await res2.text()).toContain('This page could not be found')
    })

    it('should serve shared component', async () => {
      // Without .client.js should serve
      const html = await renderViaHTTP(next.url, '/shared-component-route')
      expect(html).toContain('hello from app/shared-component-route')
    })

    describe('should serve client component', () => {
      it('should serve server-side', async () => {
        const html = await renderViaHTTP(next.url, '/client-component-route')
        const $ = cheerio.load(html)
        expect($('p').text()).toBe(
          'hello from app/client-component-route. count: 0'
        )
      })

      it('should serve client-side', async () => {
        const browser = await webdriver(next.url, '/client-component-route')

        // After hydration count should be 1
        expect(await browser.elementByCss('p').text()).toBe(
          'hello from app/client-component-route. count: 1'
        )
      })
    })

    describe('should include client component layout with server component route', () => {
      it('should include it server-side', async () => {
        const html = await renderViaHTTP(next.url, '/client-nested')
        const $ = cheerio.load(html)
        // Should not be nested in dashboard
        expect($('h1').text()).toBe('Client Nested. Count: 0')
        // Should include the page text
        expect($('p').text()).toBe('hello from app/client-nested')
      })

      it('should include it client-side', async () => {
        const browser = await webdriver(next.url, '/client-nested')

        // After hydration count should be 1
        expect(await browser.elementByCss('h1').text()).toBe(
          'Client Nested. Count: 1'
        )

        // After hydration count should be 1
        expect(await browser.elementByCss('p').text()).toBe(
          'hello from app/client-nested'
        )
      })
    })
  })

  describe('css support', () => {
    if (isDev) {
      it('should support css modules inside client layouts', async () => {
        const browser = await webdriver(next.url, '/client-nested')

        // Should render h1 in red
        expect(
          await browser.eval(
            `window.getComputedStyle(document.querySelector('h1')).color`
          )
        ).toBe('rgb(255, 0, 0)')
      })
    }
  })
})
