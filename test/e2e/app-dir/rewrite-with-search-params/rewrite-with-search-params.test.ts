import { nextTestSetup } from 'e2e-utils'
import { fetchViaRawHttp } from 'next-test-utils'
import cheerio from 'cheerio'

describe('rewrite-with-search-params', () => {
  const { next, isNextDeploy } = nextTestSetup({
    files: __dirname,
  })

  it('should not contain params in search params after rewrite', async () => {
    const deploymentHost = isNextDeploy ? new URL(next.url).hostname : null
    const shouldForceHostHeader =
      !isNextDeploy ||
      deploymentHost === 'localhost' ||
      deploymentHost === '127.0.0.1'

    const html = shouldForceHostHeader
      ? // Global fetch derives the Host header from the URL authority and
        // cannot override it, so this uses a raw HTTP request.
        await fetchViaRawHttp(next.appPort, '/galleries/123?param=value', {
          headers: {
            host: 'vercel-test.vercel.app',
          },
        }).then((res) => res.text())
      : await next.render('/galleries/123', {
          param: 'value',
        })
    const $ = cheerio.load(html)

    const searchParams = JSON.parse($('#search-params-value').text())
    const params = JSON.parse($('#params-value').text())

    expect(searchParams).toEqual({
      param: 'value',
    })

    expect(params).toEqual({
      domain: expect.stringMatching(/[\w-]+/),
      section: ['galleries', '123'],
    })
  })
})
