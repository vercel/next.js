/* eslint-disable jest/no-standalone-expect */
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('app-dir action progressive enhancement', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
    dependencies: {
      nanoid: '4.0.1',
      pg: '8.23.1',
      'server-only': 'latest',
    },
  })

  if (isTurbopack) {
    it('should submit actions that import an async external module without JS', async () => {
      let responseCode: number | undefined
      const browser = await next.browser('/async-external', {
        disableJavaScript: true,
        beforePageLoad(page) {
          page.on('response', (response) => {
            if (new URL(response.url()).pathname === '/async-external') {
              responseCode = response.status()
            }
          })
        },
      })

      await browser.elementById('submit').click()

      await retry(async () => {
        expect(await browser.elementByCss('h1').text()).toBe('submitted')
      })
      expect(responseCode).toBe(303)
    })
  }

  it('should support formData and redirect without JS', async () => {
    let responseCode: number | undefined
    const browser = await next.browser('/server', {
      disableJavaScript: true,
      beforePageLoad(page) {
        page.on('response', (response) => {
          const url = new URL(response.url())
          const status = response.status()
          if (url.pathname.includes('/server')) {
            responseCode = status
          }
        })
      },
    })

    await browser.elementById('name').type('test')
    await browser.elementById('submit').click()

    await retry(async () => {
      expect(await browser.url()).toBe(
        `${next.url}/header?name=test&hidden-info=hi`
      )
    })

    expect(responseCode).toBe(303)
  })

  it('should support actions from client without JS', async () => {
    const browser = await next.browser('/server', {
      disableJavaScript: true,
    })

    await browser.elementById('client-name').type('test')
    await browser.elementById('there').click()

    await retry(async () => {
      expect(await browser.url()).toBe(
        `${next.url}/header?name=test&hidden-info=hi`
      )
    })
  })

  it.each(['edge', 'node'])(
    'should support headers and cookies without JS (runtime: %s)',
    async (runtime) => {
      const browser = await next.browser(`/header/${runtime}/form`, {
        disableJavaScript: true,
      })

      await browser.elementById('get-referer').click()

      await retry(async () => {
        expect(await browser.elementById('referer').text()).toBe(
          `${next.url}/header/${runtime}/form`
        )
      })

      await browser.elementById('set-cookie').click()

      await retry(async () => {
        expect(await browser.elementById('referer').text()).toBe('')
      })

      await browser.elementById('get-cookie').click()

      await retry(async () => {
        expect(await browser.elementById('cookie').text()).toBe('42')
      })
    }
  )
})
