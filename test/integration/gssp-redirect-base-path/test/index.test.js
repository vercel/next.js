/* eslint-env jest */
import url from 'url'
import fs from 'fs-extra'
import webdriver from 'next-webdriver'
import { join } from 'path'
import {
  findPort,
  launchApp,
  killApp,
  nextBuild,
  nextStart,
  fetchViaHTTP,
  check,
} from 'next-test-utils'

const appDir = join(__dirname, '..')

let app
let appPort

const basePath = '/docs'

const runTests = (isDev) => {
  it('should apply temporary redirect when visited directly for GSSP page', async () => {
    const res = await fetchViaHTTP(
      appPort,
      `${basePath}/gssp-blog/redirect-1`,
      undefined,
      {
        redirect: 'manual',
      }
    )
    expect(res.status).toBe(307)

    const { pathname } = url.parse(res.headers.get('location'))

    expect(pathname).toBe(`${basePath}/404`)
  })

  it('should apply temporary redirect when visited directly basePath false for GSSP page', async () => {
    const res = await fetchViaHTTP(
      appPort,
      `${basePath}/gssp-blog/redirect-1-no-basepath-`,
      undefined,
      {
        redirect: 'manual',
      }
    )
    expect(res.status).toBe(307)

    const text = await res.text()
    expect(text).toEqual(`/404`)

    const parsedUrl = url.parse(res.headers.get('location'))
    expect(parsedUrl.pathname).toBe(`/404`)

    const browser = await webdriver(appPort, `${basePath}`)
    await browser.eval(`next.router.push('/gssp-blog/redirect-1-no-basepath-')`)
    await check(
      () => browser.eval('document.documentElement.innerHTML'),
      /oops not found/
    )

    const parsedUrl2 = url.parse(await browser.eval('window.location.href'))
    expect(parsedUrl2.pathname).toBe('/404')
  })

  it('should apply permanent redirect when visited directly for GSSP page', async () => {
    const res = await fetchViaHTTP(
      appPort,
      `${basePath}/gssp-blog/redirect-permanent`,
      undefined,
      {
        redirect: 'manual',
      }
    )
    expect(res.status).toBe(308)

    const text = await res.text()
    expect(text).toEqual(`${basePath}/404`)

    const { pathname } = url.parse(res.headers.get('location'))

    expect(pathname).toBe(`${basePath}/404`)
    expect(res.headers.get('refresh')).toContain(`url=${basePath}/404`)
  })

  it('should apply statusCode 301 redirect when visited directly for GSSP page', async () => {
    const res = await fetchViaHTTP(
      appPort,
      `${basePath}/gssp-blog/redirect-statusCode-301`,
      undefined,
      {
        redirect: 'manual',
      }
    )
    expect(res.status).toBe(301)

    const text = await res.text()
    expect(text).toEqual(`${basePath}/404`)

    const { pathname } = url.parse(res.headers.get('location'))

    expect(pathname).toBe(`${basePath}/404`)
    expect(res.headers.get('refresh')).toBe(null)
  })

  it('should apply statusCode 303 redirect when visited directly for GSSP page', async () => {
    const res = await fetchViaHTTP(
      appPort,
      `${basePath}/gssp-blog/redirect-statusCode-303`,
      undefined,
      {
        redirect: 'manual',
      }
    )
    expect(res.status).toBe(303)

    const text = await res.text()
    expect(text).toEqual(`${basePath}/404`)

    const { pathname } = url.parse(res.headers.get('location'))

    expect(pathname).toBe(`${basePath}/404`)
    expect(res.headers.get('refresh')).toBe(null)
  })

  it('should apply redirect when fallback GSP page is visited directly (internal dynamic)', async () => {
    const browser = await webdriver(
      appPort,
      `${basePath}/gsp-blog/redirect-dest-_gsp-blog_first`,
      {
        retryWaitHydration: true,
      }
    )

    await browser.waitForElementByCss('#gsp')

    const props = JSON.parse(await browser.elementByCss('#props').text())
    expect(props).toEqual({
      params: {
        post: 'first',
      },
    })
    const initialHref = await browser.eval(() => window.initialHref)
    const { pathname } = url.parse(initialHref)
    expect(pathname).toBe(`${basePath}/gsp-blog/redirect-dest-_gsp-blog_first`)
  })

  if (!isDev) {
    it('should apply redirect when fallback GSP page is visited directly (internal dynamic) 2nd visit', async () => {
      const browser = await webdriver(
        appPort,
        `${basePath}/gsp-blog/redirect-dest-_gsp-blog_first`,
        {
          retryWaitHydration: true,
        }
      )

      await browser.waitForElementByCss('#gsp')

      const props = JSON.parse(await browser.elementByCss('#props').text())
      expect(props).toEqual({
        params: {
          post: 'first',
        },
      })
      const initialHref = await browser.eval(() => window.initialHref)
      const { pathname } = url.parse(initialHref)
      // since it was cached the initial value is now the redirect
      // result
      expect(pathname).toBe(`${basePath}/gsp-blog/first`)
    })
  }

  it('should apply redirect when fallback GSP page is visited directly (internal normal)', async () => {
    const browser = await webdriver(
      appPort,
      `${basePath}/gsp-blog/redirect-dest-_`,
      {
        retryWaitHydration: true,
      }
    )

    await browser.waitForElementByCss('#index')

    const initialHref = await browser.eval(() => window.initialHref)
    const { pathname } = url.parse(initialHref)
    expect(pathname).toBe(`${basePath}/gsp-blog/redirect-dest-_`)
  })

  if (!isDev) {
    it('should apply redirect when fallback GSP page is visited directly (internal normal) 2nd visit', async () => {
      const browser = await webdriver(
        appPort,
        `${basePath}/gsp-blog/redirect-dest-_`,
        {
          retryWaitHydration: true,
        }
      )

      await browser.waitForElementByCss('#index')

      const initialHref = await browser.eval(() => window.initialHref)
      const { pathname } = url.parse(initialHref)
      expect(pathname).toBe(`${basePath}`)
    })
  }

  it('should apply redirect when fallback GSP page is visited directly (external)', async () => {
    const browser = await webdriver(
      appPort,
      `${basePath}/gsp-blog/redirect-dest-_missing`,
      {
        retryWaitHydration: true,
      }
    )

    await check(
      () => browser.eval(() => document.documentElement.innerHTML),
      /oops not found/
    )

    const initialHref = await browser.eval(() => window.initialHref)
    expect(initialHref).toBeFalsy()

    const curUrl = await browser.url()
    const { pathname } = url.parse(curUrl)
    expect(pathname).toBe('/docs/missing')
  })

  it('should apply redirect when fallback GSP page is visited directly (external domain)', async () => {
    const browser = await webdriver(
      appPort,
      `${basePath}/gsp-blog/redirect-dest-external`,
      {
        retryWaitHydration: true,
      }
    )

    await check(
      () => browser.eval(() => document.location.hostname),
      'example.vercel.sh'
    )

    const initialHref = await browser.eval(() => window.initialHref)
    expect(initialHref).toBeFalsy()
  })

  it('should apply redirect when fallback GSSP page is visited directly (external domain)', async () => {
    const browser = await webdriver(
      appPort,
      `${basePath}/gssp-blog/redirect-dest-external`,
      {
        retryWaitHydration: true,
      }
    )

    await check(
      () => browser.eval(() => document.location.hostname),
      'example.vercel.sh'
    )

    const initialHref = await browser.eval(() => window.initialHref)
    expect(initialHref).toBeFalsy()

    const res = await fetchViaHTTP(
      appPort,
      `${basePath}/gssp-blog/redirect-dest-external`,
      undefined,
      {
        redirect: 'manual',
      }
    )
    expect(res.status).toBe(307)

    const parsed = url.parse(res.headers.get('location'))
    expect(parsed.hostname).toBe('example.vercel.sh')
    expect(parsed.pathname).toBe('/')
  })

  it('should apply redirect when GSSP page is navigated to client-side (internal dynamic)', async () => {
    const browser = await webdriver(
      appPort,
      `${basePath}/gssp-blog/redirect-dest-_gssp-blog_first`,
      {
        retryWaitHydration: true,
      }
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
    const browser = await webdriver(appPort, `${basePath}`, {
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
    const browser = await webdriver(appPort, `${basePath}`, {
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
    const browser = await webdriver(appPort, `${basePath}`, {
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
    const browser = await webdriver(appPort, `${basePath}`, {
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
    const browser = await webdriver(
      appPort,
      `${basePath}/another?mark_as=root`,
      {
        retryWaitHydration: true,
      }
    )

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

    const curUrl = await browser.url()
    const { path } = url.parse(curUrl)
    expect(path).toEqual(`${basePath}`)
  })

  it('should not replace history of the origin page when GSSP page is navigated to client-side (external)', async () => {
    const browser = await webdriver(
      appPort,
      `${basePath}/another?mark_as=root`,
      {
        retryWaitHydration: true,
      }
    )

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

    const curUrl = await browser.url()
    const { path } = url.parse(curUrl)
    expect(path).toEqual(`${basePath}`)
  })

  it('should not replace history of the origin page when GSP page is navigated to client-side (internal)', async () => {
    const browser = await webdriver(
      appPort,
      `${basePath}/another?mark_as=root`,
      {
        retryWaitHydration: true,
      }
    )

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

    const curUrl = await browser.url()
    const { path } = url.parse(curUrl)
    expect(path).toEqual(`${basePath}`)
  })

  it('should not replace history of the origin page when GSP page is navigated to client-side (external)', async () => {
    const browser = await webdriver(
      appPort,
      `${basePath}/another?mark_as=root`,
      {
        retryWaitHydration: true,
      }
    )

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

    const curUrl = await browser.url()
    const { path } = url.parse(curUrl)
    expect(path).toEqual(`${basePath}`)
  })
}

describe('GS(S)P Redirect Support', () => {
  ;(process.env.TURBOPACK_BUILD ? describe.skip : describe)(
    'development mode',
    () => {
      beforeAll(async () => {
        appPort = await findPort()
        app = await launchApp(appDir, appPort)
      })
      afterAll(() => killApp(app))

      runTests(true)
    }
  )
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      beforeAll(async () => {
        await fs.remove(join(appDir, '.next'))
        await nextBuild(appDir)
        appPort = await findPort()
        app = await nextStart(appDir, appPort)
      })
      afterAll(() => killApp(app))

      runTests()

      it('should error for redirect during prerendering', async () => {
        await fs.mkdirp(join(appDir, 'pages/invalid'))
        await fs.writeFile(
          join(appDir, 'pages', 'invalid', '[slug].js'),
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
        const { stdout, stderr } = await nextBuild(appDir, undefined, {
          stdout: true,
          stderr: true,
        })
        const output = stdout + stderr
        await fs.remove(join(appDir, 'pages/invalid'))

        expect(output).toContain(
          '`redirect` can not be returned from getStaticProps during prerendering'
        )
      })
    }
  )
})
