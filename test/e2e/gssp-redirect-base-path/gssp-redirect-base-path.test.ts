import { nextTestSetup, isNextStart } from 'e2e-utils'
import { retry } from 'next-test-utils'

const basePath = '/docs'

describe('GS(S)P Redirect with basePath', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    dependencies: {
      react: '19.3.0-canary-da9325b5-20260417',
      'react-dom': '19.3.0-canary-da9325b5-20260417',
    },
    skipDeployment: true,
  })
  if (skipped) return

  it('should apply temporary redirect when visited directly for GSSP page', async () => {
    const res = await next.fetch(`${basePath}/gssp-blog/redirect-1`, {
      redirect: 'manual',
    })
    expect(res.status).toBe(307)

    const { pathname } = new URL(res.headers.get('location')!)
    expect(pathname).toBe(`${basePath}/404`)
  })

  it('should apply temporary redirect when visited directly basePath false for GSSP page', async () => {
    const res = await next.fetch(
      `${basePath}/gssp-blog/redirect-1-no-basepath-`,
      { redirect: 'manual' }
    )
    expect(res.status).toBe(307)

    const text = await res.text()
    expect(text).toEqual(`/404`)

    const parsedUrl = new URL(res.headers.get('location')!)
    expect(parsedUrl.pathname).toBe(`/404`)

    const browser = await next.browser(`${basePath}`)
    await browser.eval(`next.router.push('/gssp-blog/redirect-1-no-basepath-')`)
    await retry(async () => {
      const html = await browser.eval('document.documentElement.innerHTML')
      expect(html).toMatch(/oops not found/)
    })

    const parsedUrl2 = new URL(await browser.eval('window.location.href'))
    expect(parsedUrl2.pathname).toBe('/404')
  })

  it('should apply permanent redirect when visited directly for GSSP page', async () => {
    const res = await next.fetch(`${basePath}/gssp-blog/redirect-permanent`, {
      redirect: 'manual',
    })
    expect(res.status).toBe(308)

    const text = await res.text()
    expect(text).toEqual(`${basePath}/404`)

    const { pathname } = new URL(res.headers.get('location')!)
    expect(pathname).toBe(`${basePath}/404`)
    expect(res.headers.get('refresh')).toContain(`url=${basePath}/404`)
  })

  it('should apply statusCode 301 redirect when visited directly for GSSP page', async () => {
    const res = await next.fetch(
      `${basePath}/gssp-blog/redirect-statusCode-301`,
      { redirect: 'manual' }
    )
    expect(res.status).toBe(301)

    const text = await res.text()
    expect(text).toEqual(`${basePath}/404`)

    const { pathname } = new URL(res.headers.get('location')!)
    expect(pathname).toBe(`${basePath}/404`)
    expect(res.headers.get('refresh')).toBe(null)
  })

  it('should apply statusCode 303 redirect when visited directly for GSSP page', async () => {
    const res = await next.fetch(
      `${basePath}/gssp-blog/redirect-statusCode-303`,
      { redirect: 'manual' }
    )
    expect(res.status).toBe(303)

    const text = await res.text()
    expect(text).toEqual(`${basePath}/404`)

    const { pathname } = new URL(res.headers.get('location')!)
    expect(pathname).toBe(`${basePath}/404`)
    expect(res.headers.get('refresh')).toBe(null)
  })

  it('should apply redirect when fallback GSP page is visited directly (internal dynamic)', async () => {
    const browser = await next.browser(
      `${basePath}/gsp-blog/redirect-dest-_gsp-blog_first`,
      { retryWaitHydration: true }
    )

    await browser.waitForElementByCss('#gsp')

    const props = JSON.parse(await browser.elementByCss('#props').text())
    expect(props).toEqual({
      params: {
        post: 'first',
      },
    })
    const initialHref = await browser.eval(() => (window as any).initialHref)
    const { pathname } = new URL(initialHref)
    expect(pathname).toBe(`${basePath}/gsp-blog/redirect-dest-_gsp-blog_first`)
  })

  if (isNextStart) {
    it('should apply redirect when fallback GSP page is visited directly (internal dynamic) 2nd visit', async () => {
      const browser = await next.browser(
        `${basePath}/gsp-blog/redirect-dest-_gsp-blog_first`,
        { retryWaitHydration: true }
      )

      await browser.waitForElementByCss('#gsp')

      const props = JSON.parse(await browser.elementByCss('#props').text())
      expect(props).toEqual({
        params: {
          post: 'first',
        },
      })
      const initialHref = await browser.eval(() => (window as any).initialHref)
      const { pathname } = new URL(initialHref)
      expect(pathname).toBe(`${basePath}/gsp-blog/first`)
    })
  }

  it('should apply redirect when fallback GSP page is visited directly (internal normal)', async () => {
    const browser = await next.browser(`${basePath}/gsp-blog/redirect-dest-_`, {
      retryWaitHydration: true,
    })

    await browser.waitForElementByCss('#index')

    const initialHref = await browser.eval(() => (window as any).initialHref)
    const { pathname } = new URL(initialHref)
    expect(pathname).toBe(`${basePath}/gsp-blog/redirect-dest-_`)
  })

  if (isNextStart) {
    it('should apply redirect when fallback GSP page is visited directly (internal normal) 2nd visit', async () => {
      const browser = await next.browser(
        `${basePath}/gsp-blog/redirect-dest-_`,
        { retryWaitHydration: true }
      )

      await browser.waitForElementByCss('#index')

      const initialHref = await browser.eval(() => (window as any).initialHref)
      const { pathname } = new URL(initialHref)
      expect(pathname).toBe(`${basePath}`)
    })
  }

  it('should apply redirect when fallback GSP page is visited directly (external)', async () => {
    const browser = await next.browser(
      `${basePath}/gsp-blog/redirect-dest-_missing`,
      { retryWaitHydration: true }
    )

    await retry(async () => {
      const html = await browser.eval(() => document.documentElement.innerHTML)
      expect(html).toMatch(/oops not found/)
    })

    const initialHref = await browser.eval(() => (window as any).initialHref)
    expect(initialHref).toBeFalsy()

    const curUrl = await browser.url()
    const { pathname } = new URL(curUrl)
    expect(pathname).toBe('/docs/missing')
  })

  it('should apply redirect when fallback GSP page is visited directly (external domain)', async () => {
    const browser = await next.browser(
      `${basePath}/gsp-blog/redirect-dest-external`,
      { retryWaitHydration: true }
    )

    await retry(async () => {
      const hostname = await browser.eval(() => document.location.hostname)
      expect(hostname).toBe('example.vercel.sh')
    })

    const initialHref = await browser.eval(() => (window as any).initialHref)
    expect(initialHref).toBeFalsy()
  })

  it('should apply redirect when fallback GSSP page is visited directly (external domain)', async () => {
    const browser = await next.browser(
      `${basePath}/gssp-blog/redirect-dest-external`,
      { retryWaitHydration: true }
    )

    await retry(async () => {
      const hostname = await browser.eval(() => document.location.hostname)
      expect(hostname).toBe('example.vercel.sh')
    })

    const initialHref = await browser.eval(() => (window as any).initialHref)
    expect(initialHref).toBeFalsy()

    const res = await next.fetch(
      `${basePath}/gssp-blog/redirect-dest-external`,
      { redirect: 'manual' }
    )
    expect(res.status).toBe(307)

    const parsed = new URL(res.headers.get('location')!)
    expect(parsed.hostname).toBe('example.vercel.sh')
    expect(parsed.pathname).toBe('/')
  })

  it('should apply redirect when GSSP page is navigated to client-side (internal dynamic)', async () => {
    const browser = await next.browser(
      `${basePath}/gssp-blog/redirect-dest-_gssp-blog_first`,
      { retryWaitHydration: true }
    )

    await browser.waitForElementByCss('#gssp')

    const props = JSON.parse(await browser.elementByCss('#props').text())
    expect(props).toEqual({
      params: {
        post: 'first',
      },
    })
  })

  it('should apply redirect when GSSP page is navigated to client-side (internal normal)', async () => {
    const browser = await next.browser(`${basePath}`, {
      retryWaitHydration: true,
    })

    await browser.eval(`(function () {
      window.next.router.push('/gssp-blog/redirect-dest-_another')
    })()`)
    await browser.waitForElementByCss('#another')

    const text = await browser.elementByCss('#another').text()
    expect(text).toEqual('another Page')
  })

  it('should apply redirect when GSSP page is navigated to client-side (external)', async () => {
    const browser = await next.browser(`${basePath}`, {
      retryWaitHydration: true,
    })

    await browser.eval(`(function () {
      window.next.router.push('/gssp-blog/redirect-dest-_gssp-blog_first')
    })()`)
    await browser.waitForElementByCss('#gssp')

    const props = JSON.parse(await browser.elementByCss('#props').text())
    expect(props).toEqual({
      params: {
        post: 'first',
      },
    })
  })

  it('should apply redirect when GSP page is navigated to client-side (internal)', async () => {
    const browser = await next.browser(`${basePath}`, {
      retryWaitHydration: true,
    })

    await browser.eval(`(function () {
      window.next.router.push('/gsp-blog/redirect-dest-_another')
    })()`)
    await browser.waitForElementByCss('#another')

    const text = await browser.elementByCss('#another').text()
    expect(text).toEqual('another Page')
  })

  it('should apply redirect when GSP page is navigated to client-side (external)', async () => {
    const browser = await next.browser(`${basePath}`, {
      retryWaitHydration: true,
    })

    await browser.eval(`(function () {
      window.next.router.push('/gsp-blog/redirect-dest-_gsp-blog_first')
    })()`)
    await browser.waitForElementByCss('#gsp')

    const props = JSON.parse(await browser.elementByCss('#props').text())
    expect(props).toEqual({
      params: {
        post: 'first',
      },
    })
  })

  it('should not replace history of the origin page when GSSP page is navigated to client-side (internal normal)', async () => {
    const browser = await next.browser(`${basePath}/another?mark_as=root`, {
      retryWaitHydration: true,
    })

    await browser.eval(`(function () {
      window.next.router.push('/')
    })()`)
    await browser.waitForElementByCss('#index')

    await browser.eval(`(function () {
      window.next.router.push('/gssp-blog/redirect-dest-_another')
    })()`)
    await browser.waitForElementByCss('#another')

    await browser.eval(`(function () {
      window.history.back()
    })()`)

    await retry(async () => {
      const curUrl = await browser.url()
      const { pathname, search } = new URL(curUrl)
      expect(pathname + search).toEqual(`${basePath}`)
    })
  })

  it('should not replace history of the origin page when GSSP page is navigated to client-side (external)', async () => {
    const browser = await next.browser(`${basePath}/another?mark_as=root`, {
      retryWaitHydration: true,
    })

    await browser.eval(`(function () {
      window.next.router.push('/')
    })()`)
    await browser.waitForElementByCss('#index')

    await browser.eval(`(function () {
      window.next.router.push('/gssp-blog/redirect-dest-_gssp-blog_first')
    })()`)
    await browser.waitForElementByCss('#gssp')

    await browser.eval(`(function () {
      window.history.back()
    })()`)

    await retry(async () => {
      const curUrl = await browser.url()
      const { pathname, search } = new URL(curUrl)
      expect(pathname + search).toEqual(`${basePath}`)
    })
  })

  it('should not replace history of the origin page when GSP page is navigated to client-side (internal)', async () => {
    const browser = await next.browser(`${basePath}/another?mark_as=root`, {
      retryWaitHydration: true,
    })

    await browser.eval(`(function () {
      window.next.router.push('/')
    })()`)
    await browser.waitForElementByCss('#index')

    await browser.eval(`(function () {
      window.next.router.push('/gsp-blog/redirect-dest-_another')
    })()`)
    await browser.waitForElementByCss('#another')

    await browser.eval(`(function () {
      window.history.back()
    })()`)

    await retry(async () => {
      const curUrl = await browser.url()
      const { pathname, search } = new URL(curUrl)
      expect(pathname + search).toEqual(`${basePath}`)
    })
  })

  it('should not replace history of the origin page when GSP page is navigated to client-side (external)', async () => {
    const browser = await next.browser(`${basePath}/another?mark_as=root`, {
      retryWaitHydration: true,
    })

    await browser.eval(`(function () {
      window.next.router.push('/')
    })()`)
    await browser.waitForElementByCss('#index')

    await browser.eval(`(function () {
      window.next.router.push('/gsp-blog/redirect-dest-_gsp-blog_first')
    })()`)
    await browser.waitForElementByCss('#gsp')

    await browser.eval(`(function () {
      window.history.back()
    })()`)

    await retry(async () => {
      const curUrl = await browser.url()
      const { pathname, search } = new URL(curUrl)
      expect(pathname + search).toEqual(`${basePath}`)
    })
  })

  if (isNextStart) {
    it('should error for redirect during prerendering', async () => {
      await next.patchFile(
        'pages/invalid/[slug].js',
        `
        export default function Post(props) {
          return "hi"
        }

        export const getStaticProps = ({ params }) => {
          return {
            redirect: {
              permanent: true,
              destination: '/another'
            }
          }
        }

        export const getStaticPaths = () => {
          return {
            paths: ['first', 'second'].map((slug) => ({ params: { slug } })),
            fallback: true,
          }
        }
      `
      )
      await next.stop()
      const { cliOutput } = await next.build()
      await next.deleteFile('pages/invalid/[slug].js')
      await next.start()

      expect(cliOutput).toContain(
        '`redirect` can not be returned from getStaticProps during prerendering'
      )
    })
  }
})
