import { nextTestSetup } from 'e2e-utils'

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

    const $ = await next.render$(
      '/galleries/123',
      {
        param: 'value',
      },
      {
        headers: shouldForceHostHeader
          ? {
              host: 'vercel-test.vercel.app',
            }
          : undefined,
      }
    )

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
