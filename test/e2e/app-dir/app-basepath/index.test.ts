import { nextTestSetup } from 'e2e-utils'
import { check, retry } from 'next-test-utils'
import type { Request, Response } from 'playwright'

describe('app dir - basepath', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    dependencies: {
      sass: 'latest',
    },
  })

  it('should successfully hard navigate from pages -> app', async () => {
    const browser = await next.browser('/base/pages-path')
    await browser.elementByCss('#to-another').click()
    await browser.waitForElementByCss('#page-2')
  })

  it('should support `basePath`', async () => {
    const html = await next.render('/base')
    expect(html).toContain('<h1>Test Page</h1>')
  })

  it('should support Link with basePath prefixed', async () => {
    const browser = await next.browser('/base')
    expect(
      await browser
        .elementByCss('a[href="/base/another"]')
        .click()
        .waitForElementByCss('#page-2')
        .text()
    ).toBe(`Page 2`)
  })

  it('should prefix metadata og image with basePath', async () => {
    const $ = await next.render$('/base/another')
    const ogImageHref = $('meta[property="og:image"]').attr('content')

    expect(ogImageHref).toContain('/base/another/opengraph-image.png')
  })

  it('should prefix redirect() with basePath', async () => {
    const browser = await next.browser('/base/redirect')
    await retry(async () => {
      expect(await browser.url()).toBe(`${next.url}/base/another`)
    })
  })

  it('should render usePathname without the basePath', async () => {
    const pathnames = ['/use-pathname', '/use-pathname-another']
    const validatorPromises = pathnames.map(async (pathname) => {
      const $ = await next.render$('/base' + pathname)
      expect($('#pathname').data('pathname')).toBe(pathname)
    })
    await Promise.all(validatorPromises)
  })

  it('should handle redirect in dynamic in suspense boundary routes with basePath', async () => {
    const browser = await next.browser('/base/dynamic/source')
    await retry(async () => {
      // Check content is loaded first to avoid flakiness
      expect(await browser.elementByCss('p').text()).toBe(`id:dest`)
      expect(await browser.url()).toBe(`${next.url}/base/dynamic/dest`)
    })
  })

  it.each(['/base/refresh', '/base/refresh?foo=bar'])(
    `should only make a single RSC call to the current page (%s)`,
    async (path) => {
      let rscRequests = []
      const browser = await next.browser(path, {
        beforePageLoad(page) {
          page.on('request', (request) => {
            return request.allHeaders().then((headers) => {
              if (
                headers['RSC'.toLowerCase()] === '1' &&
                // Prefetches also include `RSC`
                headers['Next-Router-Prefetch'.toLowerCase()] !== '1'
              ) {
                rscRequests.push(request.url())
              }
            })
          })
        },
      })
      await browser.elementByCss('button').click()
      await retry(async () => {
        expect(rscRequests.length).toBe(1)
        expect(rscRequests[0]).toContain(`${next.url}${path}`)
      })
    }
  )

  it.each([
    { redirectType: 'relative', buttonId: 'redirect-relative' },
    { redirectType: 'absolute', buttonId: 'redirect-absolute-internal' },
  ])(
    `should properly stream an internal server action redirect() with a $redirectType URL`,
    async ({ buttonId }) => {
      const initialPagePath = '/base/client'
      const destinationPagePath = '/base/another'

      const requests: Request[] = []
      const responses: Response[] = []

      const browser = await next.browser(initialPagePath)

      browser.on('request', (req: Request) => {
        const url = req.url()

        if (
          url.includes(initialPagePath) ||
          url.includes(destinationPagePath)
        ) {
          requests.push(req)
        }
      })

      browser.on('response', (res: Response) => {
        const url = res.url()

        if (
          url.includes(initialPagePath) ||
          url.includes(destinationPagePath)
        ) {
          responses.push(res)
        }
      })

      await browser.elementById(buttonId).click()
      await check(() => browser.url(), /\/base\/another/)

      expect(await browser.waitForElementByCss('#page-2').text()).toBe(`Page 2`)

      // This verifies the redirect & server response happens in a single roundtrip,
      // if the redirect resource was static. In development, these responses are always
      // dynamically generated, so we only expect a single request for build/deploy.
      if (!isNextDev) {
        expect(requests).toHaveLength(1)
        expect(responses).toHaveLength(1)
      }

      const request = requests[0]
      const response = responses[0]

      expect(request.method()).toEqual('POST')
      expect(request.url()).toEqual(`${next.url}${initialPagePath}`)
      expect(response.status()).toEqual(303)
    }
  )

  it('should redirect externally when encountering absolute URLs on the same host outside the basePath', async () => {
    const initialPagePath = '/base/client'
    const destinationPagePath = '/outsideBasePath'

    const requests: Request[] = []
    const responses: Response[] = []

    const browser = await next.browser(initialPagePath)

    browser.on('request', (req: Request) => {
      const url = req.url()

      if (!url.includes('_next')) {
        requests.push(req)
      }
    })

    browser.on('response', (res: Response) => {
      const url = res.url()

      if (!url.includes('_next')) {
        responses.push(res)
      }
    })

    await browser.elementById('redirect-absolute-external').click()
    await check(() => browser.url(), /\/outsideBasePath/)

    // We expect to see two requests, first a POST invoking the server
    // action. And second a GET request resolving the redirect.
    expect(requests).toHaveLength(2)
    expect(responses).toHaveLength(2)

    const [firstRequest, secondRequest] = requests
    const [firstResponse, secondResponse] = responses

    expect(firstRequest.method()).toEqual('POST')
    expect(firstRequest.url()).toEqual(`${next.url}${initialPagePath}`)

    expect(secondRequest.method()).toEqual('GET')
    expect(secondRequest.url()).toEqual(`${next.url}${destinationPagePath}`)

    expect(firstResponse.status()).toEqual(303)
    // Since this is an external request to a resource outside of NextJS
    // we expect to see a seperate request resolving the external URL.
    expect(secondResponse.status()).toEqual(200)
  })
})
