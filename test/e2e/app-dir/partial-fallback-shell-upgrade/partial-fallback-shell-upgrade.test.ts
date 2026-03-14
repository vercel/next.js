import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

const isAdapterTest = Boolean(process.env.NEXT_ENABLE_ADAPTER)

describe('partial-fallback-shell-upgrade', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    // The latest changes to support this behavior on deployed infra are available in the adapter,
    // and are not being backported to the CLI
    skipDeployment: !isAdapterTest,
  })

  if (isNextDev) {
    it('skipped in dev', () => {})
    return
  }

  it('should upgrade the fallback shell to a route shell', async () => {
    const pathname = '/two'
    let $ = await next.render$(pathname)
    expect($('#fallback').text()).toBe('loading...')
    expect($('#slug').closest('[hidden]').length).toBe(1)

    await retry(async () => {
      $ = await next.render$(pathname)
      expect($('#slug').closest('[hidden]').length).toBe(0)
      expect($('#fallback').length).toBe(0)
    })
  })

  it('should not upgrade a route shell when no params were prerendered', async () => {
    const pathname = '/no-gsp/two'
    const start = Date.now()

    await retry(
      async () => {
        const $ = await next.render$(pathname)
        expect($('#fallback').text()).toBe('loading...')
        expect($('#slug').closest('[hidden]').length).toBe(1)

        if (Date.now() - start < 5000) {
          throw new Error('continue polling fallback shell')
        }
      },
      6000,
      500,
      'no-gsp fallback shell should remain unupgraded'
    )
  })
})
