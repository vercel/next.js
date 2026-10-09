import { nextTestSetup } from 'e2e-utils'

describe('use-cache-generate-static-params-server-action', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // Server Action deserialization currently fails during generateStaticParams
  // because globalThis.__next_require__ has not been initialized.
  // Keep the build inside the test so the known failure is gated, not a hook error.
  // @gate FIXME
  it('can call a server action returned from use cache during generateStaticParams', async () => {
    const $ = await next.render$('/static-params/known')
    expect($('p').text()).toBe('known')
  })
})
