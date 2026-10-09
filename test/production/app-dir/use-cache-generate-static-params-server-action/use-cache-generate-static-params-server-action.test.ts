import { nextTestSetup } from 'e2e-utils'

describe('use-cache-generate-static-params-server-action', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('can call a server action returned from use cache during generateStaticParams', async () => {
    const $ = await next.render$('/static-params/known')
    expect($('p').text()).toBe('known')
  })
})
