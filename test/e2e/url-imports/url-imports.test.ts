import {
  getBrowserBodyText,
  startStaticServer,
  stopApp,
  retry,
} from 'next-test-utils'
import { FileRef, nextTestSetup, isNextDev } from 'e2e-utils'
import { join } from 'path'

// experimental.urlImports is not implemented in Turbopack
;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
  `Handle url imports`,
  () => {
    let staticServer
    let staticServerPort
    beforeAll(async () => {
      staticServerPort = 12345
      staticServer = await startStaticServer(
        join(__dirname, 'source'),
        undefined,
        staticServerPort
      )
    })
    afterAll(async () => {
      await stopApp(staticServer)
    })

    const { next, skipped } = nextTestSetup({
      files: isNextDev
        ? {
            // exclude next.lock here, should be generated automatically in dev
            'next.config.js': new FileRef(join(__dirname, 'next.config.js')),
            pages: new FileRef(join(__dirname, 'pages')),
            public: new FileRef(join(__dirname, 'public')),
          }
        : __dirname,
      // The staticServer above doesn't work when deployed
      skipDeployment: true,
    })

    if (skipped) {
      return
    }

    const expectedServer =
      /Hello <!-- -->42<!-- -->\+<!-- -->42<!-- -->\+<!-- -->\/_next\/static\/media\/vercel\.[0-9a-f]{8}\.png<!-- -->\+<!-- -->\/_next\/static\/media\/vercel\.[0-9a-f]{8}\.png/
    const expectedClient = new RegExp(
      expectedServer.source.replace(/<!-- -->/g, '')
    )

    for (const page of ['/static', '/ssr', '/ssg']) {
      it(`should render the ${page} page`, async () => {
        const html = await next.render(page)
        expect(html).toMatch(expectedServer)
      })

      it(`should client-render the ${page} page`, async () => {
        const browser = await next.browser(page)
        await retry(async () =>
          expect(await getBrowserBodyText(browser)).toMatch(expectedClient)
        )
      })
    }

    it(`should render a static url image import`, async () => {
      const browser = await next.browser('/image')
      await browser.waitForElementByCss('#static-image')
      await retry(async () =>
        expect(
          await browser.elementByCss('#static-image').getAttribute('src')
        ).toMatch(
          /^\/_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2Fvercel\.[0-9a-f]{8}\.png&/
        )
      )
    })

    it(`should allow url import in css`, async () => {
      const browser = await next.browser('/css')

      await browser.waitForElementByCss('#static-css')
      await retry(async () =>
        expect(
          await browser
            .elementByCss('#static-css')
            .getComputedCss('background-image')
        ).toMatch(
          /^url\("http(s)?:\/\/.+\/_next\/static\/media\/vercel\.[0-9a-f]{8}\.png"\)$/
        )
      )
    })

    it('should respond on value api', async () => {
      const data = await next
        .fetch('/api/value')
        .then((res) => res.ok && res.json())

      expect(data).toEqual({ value: 42 })
    })
  }
)
