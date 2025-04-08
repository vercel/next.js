import { nextTestSetup } from 'e2e-utils'

describe('rewrite-with-search-params', () => {
  const { next, isNextDeploy } = nextTestSetup({
    files: __dirname,
  })

  it('should not contain params in search params after rewrite', async () => {
    const $ = await next.render$(
      '/galleries/123',
      {
        param: 'value',
      },
      {
        headers: isNextDeploy
          ? undefined
          : {
              host: 'vercel-test.vercel.app',
            },
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
