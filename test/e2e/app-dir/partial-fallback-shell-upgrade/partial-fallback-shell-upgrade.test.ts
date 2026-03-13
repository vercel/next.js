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
})
