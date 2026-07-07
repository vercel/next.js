import { nextTestSetup, isNextStart } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('GS(S)P Redirect Support', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    dependencies: {
      react: '19.3.0-canary-fef12a01-20260413',
      'react-dom': '19.3.0-canary-fef12a01-20260413',
    },
    skipDeployment: true,
  })
  if (skipped) return

  it('should apply temporary redirect when visited directly for GSSP page', async () => {
    const res = await next.fetch('/gssp-blog/redirect-1', {
      redirect: 'manual',
    })
    expect(res.status).toBe(307)

    const { pathname } = new URL(res.headers.get('location')!)
    expect(pathname).toBe('/404')
  })

  it('should apply permanent redirect when visited directly for GSSP page', async () => {
    const res = await next.fetch('/gssp-blog/redirect-permanent', {
      redirect: 'manual',
    })
    expect(res.status).toBe(308)

    const { pathname } = new URL(res.headers.get('location')!)
    expect(pathname).toBe('/404')
    expect(res.headers.get('refresh')).toMatch(/url=\/404/)
  })

  it('should apply statusCode 301 redirect when visited directly for GSSP page', async () => {
    const res = await next.fetch('/gssp-blog/redirect-statusCode-301', {
      redirect: 'manual',
    })
    expect(res.status).toBe(301)

    const { pathname } = new URL(res.headers.get('location')!)
    expect(pathname).toBe('/404')
    expect(res.headers.get('refresh')).toBe(null)
  })

  it('should apply statusCode 303 redirect when visited directly for GSSP page', async () => {
    const res = await next.fetch('/gssp-blog/redirect-statusCode-303', {
      redirect: 'manual',
    })
    expect(res.status).toBe(303)

    const { pathname } = new URL(res.headers.get('location')!)
    expect(pathname).toBe('/404')
    expect(res.headers.get('refresh')).toBe(null)
  })

  it('should apply redirect when fallback GSP page is visited directly (internal dynamic)', async () => {
    const browser = await next.browser(
      '/gsp-blog/redirect-dest-_gsp-blog_first'
    )

    await browser.waitForElementByCss('#gsp')

    const props = JSON.parse(await browser.elementByCss('#props').text())
    expect(props).toEqual({
      params: {
        post: 'first',
      },
    })
    const initialHref = await browser.eval(
      () => (window as any).initialHref as string
    )
    const { pathname } = new URL(initialHref)
    expect(pathname).toBe('/gsp-blog/redirect-dest-_gsp-blog_first')
  })

  it('should apply redirect when fallback blocking GSP page is visited directly (internal dynamic)', async () => {
    const browser = await next.browser(
      '/gsp-blog-blocking/redirect-dest-_gsp-blog_first'
    )

    await browser.waitForElementByCss('#gsp')

    const props = JSON.parse(await browser.elementByCss('#props').text())
    expect(props).toEqual({
      params: {
        post: 'first',
      },
    })
    const initialHref = await browser.eval(
      () => (window as any).initialHref as string
    )
    const { pathname } = new URL(initialHref)
    expect(pathname).toBe('/gsp-blog/first')
  })

  it('should apply redirect when fallback blocking GSP page is visited directly (internal dynamic) second visit', async () => {
    const browser = await next.browser(
      '/gsp-blog-blocking/redirect-dest-_gsp-blog_first'
    )

    await browser.waitForElementByCss('#gsp')

    const props = JSON.parse(await browser.elementByCss('#props').text())
    expect(props).toEqual({
      params: {
        post: 'first',
      },
    })
    const initialHref = await browser.eval(
      () => (window as any).initialHref as string
    )
    const { pathname } = new URL(initialHref)
    expect(pathname).toBe('/gsp-blog/first')
  })

  it('should apply redirect when fallback blocking GSP page is visited directly (internal dynamic) with revalidate', async () => {
    const browser = await next.browser(
      '/gsp-blog-blocking/redirect-revalidate-dest-_gsp-blog_first'
    )

    await browser.waitForElementByCss('#gsp')

    const props = JSON.parse(await browser.elementByCss('#props').text())
    expect(props).toEqual({
      params: {
        post: 'first',
      },
    })
    const initialHref = await browser.eval(
      () => (window as any).initialHref as string
    )
    const { pathname } = new URL(initialHref)
    expect(pathname).toBe('/gsp-blog/first')
  })

  it('should apply redirect when fallback blocking GSP page is visited directly (internal dynamic) with revalidate second visit', async () => {
    const browser = await next.browser(
      '/gsp-blog-blocking/redirect-revalidate-dest-_gsp-blog_first'
    )

    await browser.waitForElementByCss('#gsp')

    const props = JSON.parse(await browser.elementByCss('#props').text())
    expect(props).toEqual({
      params: {
        post: 'first',
      },
    })
    const initialHref = await browser.eval(
      () => (window as any).initialHref as string
    )
    const { pathname } = new URL(initialHref)
    expect(pathname).toBe('/gsp-blog/first')
  })

  if (isNextStart) {
    it('should apply redirect when fallback GSP page is visited directly (internal dynamic) 2nd visit', async () => {
      const browser = await next.browser(
        '/gsp-blog/redirect-dest-_gsp-blog_first'
      )

      await browser.waitForElementByCss('#gsp')

      const props = JSON.parse(await browser.elementByCss('#props').text())
      expect(props).toEqual({
        params: {
          post: 'first',
        },
      })
      const initialHref = await browser.eval(
        () => (window as any).initialHref as string
      )
      const { pathname } = new URL(initialHref)
      expect(pathname).toBe('/gsp-blog/first')
    })
  }

  it('should apply redirect when fallback GSP page is visited directly (internal normal)', async () => {
    const browser = await next.browser('/gsp-blog/redirect-dest-_')

    await browser.waitForElementByCss('#index')

    const initialHref = await browser.eval(
      () => (window as any).initialHref as string
    )
    const { pathname } = new URL(initialHref)
    expect(pathname).toBe('/gsp-blog/redirect-dest-_')
  })

  if (isNextStart) {
    it('should apply redirect when fallback GSP page is visited directly (internal normal) 2nd visit', async () => {
      const browser = await next.browser('/gsp-blog/redirect-dest-_')

      await browser.waitForElementByCss('#index')

      const initialHref = await browser.eval(
        () => (window as any).initialHref as string
      )
      const { pathname } = new URL(initialHref)
      expect(pathname).toBe('/')
    })
  }

  it('should apply redirect when fallback GSP page is visited directly (external)', async () => {
    const browser = await next.browser('/gsp-blog/redirect-dest-_missing')

    await retry(async () => {
      const html = await browser.eval(() => document.documentElement.innerHTML)
      expect(html).toMatch(/oops not found/)
    })

    const initialHref = await browser.eval(
      () => (window as any).initialHref as string
    )
    expect(initialHref).toBeFalsy()

    const curUrl = await browser.url()
    const { pathname } = new URL(curUrl)
    expect(pathname).toBe('/missing')
  })

  it('should apply redirect when fallback GSP page is visited directly (external domain)', async () => {
    const browser = await next.browser('/gsp-blog/redirect-dest-external')

    await retry(async () => {
      const hostname = await browser.eval(() => document.location.hostname)
      expect(hostname).toBe('example.vercel.sh')
    })

    const initialHref = await browser.eval(
      () => (window as any).initialHref as string
    )
    expect(initialHref).toBeFalsy()
  })

  it('should apply redirect when fallback GSSP page is visited directly (external domain)', async () => {
    const browser = await next.browser('/gssp-blog/redirect-dest-external')

    await retry(async () => {
      const hostname = await browser.eval(() => document.location.hostname)
      expect(hostname).toBe('example.vercel.sh')
    })

    const initialHref = await browser.eval(
      () => (window as any).initialHref as string
    )
    expect(initialHref).toBeFalsy()

    const res = await next.fetch('/gssp-blog/redirect-dest-external', {
      redirect: 'manual',
    })
    expect(res.status).toBe(307)

    const parsed = new URL(res.headers.get('location')!)
    expect(parsed.hostname).toBe('example.vercel.sh')
    expect(parsed.pathname).toBe('/')
  })

  it('should apply redirect when GSSP page is navigated to client-side (internal dynamic)', async () => {
    const browser = await next.browser(
      '/gssp-blog/redirect-dest-_gssp-blog_first'
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
    const browser = await next.browser('/')

    await browser.eval(`(function () {
      window.next.router.push('/gssp-blog/redirect-dest-_another')
    })()`)
    await browser.waitForElementByCss('#another')

    const text = await browser.elementByCss('#another').text()
    expect(text).toEqual('another Page')
  })

  it('should apply redirect when GSSP page is navigated to client-side (external)', async () => {
    const browser = await next.browser('/')

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
    const browser = await next.browser('/')

    await browser.eval(`(function () {
      window.next.router.push('/gsp-blog/redirect-dest-_another')
    })()`)
    await browser.waitForElementByCss('#another')

    const text = await browser.elementByCss('#another').text()
    expect(text).toEqual('another Page')
  })

  it('should apply redirect when GSP page is navigated to client-side (external)', async () => {
    const browser = await next.browser('/')

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
    const browser = await next.browser('/another?mark_as=root')

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
      expect(pathname + search).toEqual('/')
    })
  })

  it('should not replace history of the origin page when GSSP page is navigated to client-side (external)', async () => {
    const browser = await next.browser('/another?mark_as=root')

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
      expect(pathname + search).toEqual('/')
    })
  })

  it('should not replace history of the origin page when GSP page is navigated to client-side (internal)', async () => {
    const browser = await next.browser('/another?mark_as=root')

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
      expect(pathname + search).toEqual('/')
    })
  })

  it('should not replace history of the origin page when GSP page is navigated to client-side (external)', async () => {
    const browser = await next.browser('/another?mark_as=root')

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
      expect(pathname + search).toEqual('/')
    })
  })

  if (isNextStart) {
    it('should not have errors in output', async () => {
      expect(next.cliOutput).not.toContain('Failed to update prerender files')
    })

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
