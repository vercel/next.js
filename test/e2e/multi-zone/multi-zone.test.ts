import { nextTestSetup, isNextDev } from 'e2e-utils'
import { check, retry, waitFor } from 'next-test-utils'
import path from 'path'

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// It likely mutates files in the isolated local fixture after setup.
// @force-gate !deploy
describe('multi-zone', () => {
  const { next } = nextTestSetup({
    files: path.join(__dirname, 'app'),
    buildCommand: 'pnpm build',
    startCommand: isNextDev ? 'pnpm dev' : 'pnpm start',
    serverReadyPattern: /Next mode: (production|development)/,
    packageJson: {
      scripts: {
        dev: 'node server.js',
        build: 'next build apps/host && next build apps/guest',
        start: 'NODE_ENV=production node server.js',
        'post-build': 'echo done',
      },
    },
    dependencies: require('./app/package.json').dependencies,
  })

  it.each([
    { pathname: '/', content: ['hello from host app'] },
    { pathname: '/guest', content: ['hello from guest app'] },
    {
      pathname: '/blog/post-1',
      content: ['hello from host app /blog/[slug]'],
    },
    {
      pathname: '/guest/blog/post-1',
      content: ['hello from guest app /blog/[slug]'],
    },
    {
      pathname: '/guest/another/post-1',
      content: ['hello from guest app /another/[slug]'],
    },
  ])(
    'should correctly respond for $pathname',
    async ({ pathname, content }) => {
      const res = await next.fetch(pathname, {
        redirect: 'manual',
      })
      expect(res.status).toBe(200)

      const html = await res.text()

      for (const item of content) {
        expect(html).toContain(item)
      }
    }
  )

  // multi-zones.mdx: each zone's advertised assets must be reachable through
  // the same frontend as its pages, without colliding with the other zone.
  for (const [pathname, prefix, zone] of [
    ['/', '/_next/', 'host'],
    ['/guest', '/guest/_next/', 'guest'],
  ]) {
    it(`serves the scripts and styles advertised by the ${zone} zone`, async () => {
      const $ = await next.render$(pathname)
      const scripts = $('script[src]')
        .toArray()
        .map((element) => $(element).attr('src')!)
        .filter(
          (url) => url.includes('/_next/static/') && url.includes('/chunks/')
        )
      const styles = $('link[rel="stylesheet"][href]')
        .toArray()
        .map((element) => $(element).attr('href')!)
        .filter((url) => url.includes('/_next/'))
      expect(scripts.length).toBeGreaterThan(0)
      // Development injects CSS through JavaScript; production advertises it
      // as a stylesheet. The browser assertion below verifies both modes.
      if (!isNextDev) expect(styles.length).toBeGreaterThan(0)
      for (const advertisedUrl of [...scripts, ...styles]) {
        const url = new URL(advertisedUrl, next.url)
        expect(url.pathname.startsWith(prefix)).toBe(true)
        const response = await next.fetch(url.pathname + url.search)
        expect(response.status).toBe(200)
        expect(response.headers.get('content-type')).toMatch(
          /javascript|text\/css/
        )
      }
      const browser = await next.browser(pathname)
      await retry(async () => {
        expect(
          await browser.eval(
            'getComputedStyle(document.documentElement).getPropertyValue("--zone-name").trim()'
          )
        ).toBe(zone)
      })
    })
  }

  it('performs a full document navigation between zones using ordinary anchors', async () => {
    const browser = await next.browser('/')
    await browser.eval('window.__zoneNavigationMarker = "host"')
    await browser.elementByCss('#visit-guest').click()
    await retry(async () => {
      expect(await browser.elementByCss('body').text()).toContain(
        'hello from guest app'
      )
    })
    expect(new URL(await browser.url()).pathname).toBe('/guest')
    expect(await browser.eval('window.__zoneNavigationMarker')).toBeUndefined()

    await browser.eval('window.__zoneNavigationMarker = "guest"')
    await browser.elementByCss('#visit-host').click()
    await retry(async () => {
      expect(await browser.elementByCss('body').text()).toContain(
        'hello from host app'
      )
    })
    expect(new URL(await browser.url()).pathname).toBe('/')
    expect(await browser.eval('window.__zoneNavigationMarker')).toBeUndefined()
  })

  for (const [zone, pathname, destination] of [
    ['host', '/', '/blog/post-1'],
    ['guest', '/guest', '/guest/blog/post-1'],
  ]) {
    it(`keeps a same-zone ${zone} Link navigation soft`, async () => {
      const browser = await next.browser(pathname)
      await browser.eval('window.__zoneNavigationMarker = "retained"')
      await browser.elementByCss('#same-zone-blog').click()
      await retry(async () => {
        expect(await browser.elementByCss('body').text()).toContain(
          `hello from ${zone} app /blog/[slug]`
        )
      })
      expect(new URL(await browser.url()).pathname).toBe(destination)
      expect(await browser.eval('window.__zoneNavigationMarker')).toBe(
        'retained'
      )
    })
  }

  if (isNextDev) {
    async function runHMRTest(app: string) {
      const isHostApp = app === 'host'
      const browser = await next.browser(isHostApp ? '/' : app)
      expect(await browser.elementByCss('body').text()).toContain(
        `hello from ${app} app`
      )
      const initialTimestamp = await browser.elementById('now').text()

      expect(await browser.elementByCss('body').text()).not.toContain(
        'hmr content'
      )

      await waitFor(1000)

      // verify that the page isn't unexpectedly reloading in the background
      const newTimestamp = await browser.elementById('now').text()
      expect(newTimestamp).toBe(initialTimestamp)

      // trigger HMR
      const filePath = `apps/${app}/pages/index.tsx`
      const content = await next.readFile(filePath)

      const patchedContent = content.replace(
        `const editedContent = ''`,
        `const editedContent = 'hmr content'`
      )
      await next.patchFile(filePath, patchedContent)

      await check(() => browser.elementByCss('body').text(), /hmr content/)

      // restore original content
      await next.patchFile(filePath, content)
    }

    it('should support HMR in both apps', async () => {
      await runHMRTest('host')
      await runHMRTest('guest')
    })
  }
})
