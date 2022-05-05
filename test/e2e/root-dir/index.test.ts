import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { fetchViaHTTP, renderViaHTTP } from 'next-test-utils'
import path from 'path'
import cheerio from 'cheerio'
import webdriver from 'next-webdriver'

describe('root dir', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        public: new FileRef(path.join(__dirname, 'app/public')),
        pages: new FileRef(path.join(__dirname, 'app/pages')),
        root: new FileRef(path.join(__dirname, 'app/root')),
        'root.server.js': new FileRef(
          path.join(__dirname, 'app/root.server.js')
        ),
        'next.config.js': new FileRef(
          path.join(__dirname, 'app/next.config.js')
        ),
      },
      dependencies: {
        react: '18.0.0-rc.2',
        'react-dom': '18.0.0-rc.2',
      },
    })
  })
  afterAll(() => next.destroy())

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

  it('should serve from root', async () => {
    const html = await renderViaHTTP(next.url, '/dashboard')
    expect(html).toContain('hello from root/dashboard')
  })

  it('should include layouts when no direct parent layout', async () => {
    const html = await renderViaHTTP(next.url, '/dashboard/integrations')
    const $ = cheerio.load(html)
    // Should not be nested in dashboard
    expect($('h1').text()).toBe('Dashboard')
    // Should include the page text
    expect($('p').text()).toBe('hello from root/dashboard/integrations')
  })

  // TODO: why is this routable but /should-not-serve-server.server.js
  it('should not include parent when not in parent directory with route in directory', async () => {
    const html = await renderViaHTTP(next.url, '/dashboard/rootonly/hello')
    const $ = cheerio.load(html)

    // Should be nested in /root.js
    expect($('html').hasClass('this-is-the-document-html')).toBeTruthy()
    expect($('body').hasClass('this-is-the-document-body')).toBeTruthy()

    // Should not be nested in dashboard
    expect($('h1').text()).toBeFalsy()

    // Should render the page text
    expect($('p').text()).toBe('hello from root/dashboard/rootonly/hello')
  })

  it('should include parent document when no direct parent layout', async () => {
    const html = await renderViaHTTP(next.url, '/dashboard/integrations')
    const $ = cheerio.load(html)

    // Root has to provide it's own document
    expect($('html').hasClass('this-is-the-document-html')).toBeTruthy()
    expect($('body').hasClass('this-is-the-document-body')).toBeTruthy()
  })

  it('should not include parent when not in parent directory', async () => {
    const html = await renderViaHTTP(next.url, '/dashboard/changelog')
    const $ = cheerio.load(html)
    // Should not be nested in dashboard
    expect($('h1').text()).toBeFalsy()
    // Should include the page text
    expect($('p').text()).toBe('hello from root/dashboard/changelog')
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
      'hello from root/dashboard/deployments/[id]. ID is: 123'
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
    expect(html).toContain('hello from root/partial-match-[id]. ID is: 123')
  })

  // TODO: Implement
  describe.skip('parallel routes', () => {
    describe('conditional routes', () => {
      it('should serve user page', async () => {
        const html = await renderViaHTTP(next.url, '/conditional/tim')
        expect(html).toContain('hello from user homepage')
      })

      it('should serve user teams page', async () => {
        const html = await renderViaHTTP(next.url, '/conditional/tim/teams')
        expect(html).toContain('hello from user/teams')
      })

      it('should not serve teams page to user', async () => {
        const html = await renderViaHTTP(next.url, '/conditional/tim/members')
        expect(html).not.toContain('hello from team/members')
      })

      it('should serve team page', async () => {
        const html = await renderViaHTTP(next.url, '/conditional/vercel')
        expect(html).toContain('hello from team homepage')
      })

      it('should serve team members page', async () => {
        const html = await renderViaHTTP(
          next.url,
          '/conditional/vercel/members'
        )
        expect(html).toContain('hello from team/members')
      })

      it('should provide both matches if both paths match', async () => {
        const html = await renderViaHTTP(next.url, '/conditional/both')
        expect(html).toContain('hello from team homepage')
        expect(html).toContain('hello from user homepage')
      })

      it('should 404 based on getServerSideProps', async () => {
        const res = await fetchViaHTTP(next.url, '/conditional/nonexistent')
        expect(res.status).toBe(404)
        expect(await res.text()).toContain('This page could not be found')
      })
    })
  })

  describe('server components', () => {
    // TODO: why is this not servable but /dashboard+rootonly/hello.server.js
    // should be? Seems like they both either should be servable or not
    it('should not serve .server.js as a path', async () => {
      // Without .server.js should serve
      const html = await renderViaHTTP(next.url, '/should-not-serve-server')
      expect(html).toContain('hello from root/should-not-serve-server')

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
      expect(html).toContain('hello from root/should-not-serve-client')

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
      expect(html).toContain('hello from root/shared-component-route')
    })

    // TODO: implement
    it.skip('should serve client component', async () => {
      const html = await renderViaHTTP(next.url, '/client-component-route')
      expect(html).toContain('hello from root/client-component-route. count: 0')

      const browser = await webdriver(next.url, '/client-component-route')
      // After hydration count should be 1
      expect(await browser.elementByCss('p').text()).toBe(
        'hello from root/client-component-route. count: 1'
      )
    })

    // TODO: implement
    it.skip('should include client component layout with server component route', async () => {
      const html = await renderViaHTTP(next.url, '/client-nested')
      const $ = cheerio.load(html)
      // Should not be nested in dashboard
      expect($('h1').text()).toBe('Client Nested. Count: 0')
      // Should include the page text
      expect($('p').text()).toBe('hello from root/client-nested')

      const browser = await webdriver(next.url, '/client-nested')
      // After hydration count should be 1
      expect(await browser.elementByCss('h1').text()).toBe(
        'Client Nested. Count: 0'
      )

      // After hydration count should be 1
      expect(await browser.elementByCss('h1').text()).toBe(
        'hello from root/client-nested'
      )
    })
  })
})
