import { nextTestSetup } from 'e2e-utils'

describe('forbidden-basic', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  it("should propagate forbidden errors past a segment's error boundary", async () => {
    let browser = await next.browser('/error-boundary')
    await browser.elementByCss('button').click()
    expect(await browser.elementByCss('h1').text()).toBe('Root Forbidden')

    browser = await next.browser('/error-boundary/nested/nested-2')
    await browser.elementByCss('button').click()
    expect(await browser.elementByCss('h1').text()).toBe(
      'Forbidden (error-boundary/nested)'
    )

    browser = await next.browser('/error-boundary/nested/trigger-forbidden')
    expect(await browser.elementByCss('h1').text()).toBe(
      'Forbidden (error-boundary/nested)'
    )
  })

  const runTests = ({ isEdge }: { isEdge: boolean }) => {
    it('should match dynamic route forbidden boundary correctly', async () => {
      // `/dynamic` display works
      const browserDynamic = await next.browser('/dynamic')
      expect(await browserDynamic.elementByCss('main').text()).toBe('dynamic')

      // `/dynamic/404` calling notFound() will match the same level not-found boundary
      const browserDynamic404 = await next.browser('/dynamic/403')
      expect(await browserDynamic404.elementByCss('#forbidden').text()).toBe(
        'dynamic/[id] forbidden'
      )

      const browserDynamicId = await next.browser('/dynamic/123')
      expect(await browserDynamicId.elementByCss('#page').text()).toBe(
        'dynamic [id]'
      )
    })

    it('should escalate forbidden to parent layout if no forbidden boundary present in current layer', async () => {
      const browserDynamic = await next.browser(
        '/dynamic-layout-without-forbidden'
      )
      expect(await browserDynamic.elementByCss('h1').text()).toBe(
        'Dynamic with Layout'
      )

      // no forbidden boundary in /dynamic-layout-without-not-found, escalate to parent layout to render root forbidden
      const browserDynamicId = await next.browser(
        '/dynamic-layout-without-forbidden/403'
      )
      expect(await browserDynamicId.elementByCss('h1').text()).toBe(
        'Root Forbidden'
      )

      const browserDynamic404 = await next.browser(
        '/dynamic-layout-without-forbidden/123'
      )
      expect(await browserDynamic404.elementByCss('#page').text()).toBe(
        'dynamic-layout-without-forbidden [id]'
      )
    })

    // TODO(@panteliselef): Do we need a 401.html ?
    if (!isNextDev && !isEdge) {
      it('should create the 404 mapping and copy the file to pages', async () => {
        const html = await next.readFile('.next/server/pages/404.html')
        expect(html).toContain('Root Forbidden')
        expect(
          await next.readFile('.next/server/pages-manifest.json')
        ).toContain('"pages/404.html"')
      })
    }
  }

  describe('with default runtime', () => {
    runTests({ isEdge: false })
  })

  describe('with runtime = edge', () => {
    let originalLayout = ''
    const FILE_PATH = 'app/layout.tsx'

    beforeAll(async () => {
      await next.stop()
      originalLayout = await next.readFile(FILE_PATH)
      await next.patchFile(
        FILE_PATH,
        `export const runtime = 'edge'\n${originalLayout}`
      )
      await next.start()
    })
    afterAll(async () => {
      await next.patchFile(FILE_PATH, originalLayout)
    })

    runTests({ isEdge: true })
  })
})
