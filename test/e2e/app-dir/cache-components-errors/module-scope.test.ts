import { nextTestSetup } from 'e2e-utils'

describe('Lazy Module Init', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname + '/fixtures/lazy-module-init',
    skipStart: true,
    // TODO(deploy-test-completion): Re-enable this suite in deploy mode.
    // It likely asserts local CLI or runtime output that deploy tests do not expose.
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  if (isNextDev) {
    it('does not run in dev', () => {})
    return
  }

  it('should build statically even if module scope uses sync APIs like current time and random', async () => {
    try {
      await next.start()
    } catch {
      throw new Error('expected build not to fail for fully static project')
    }

    expect(next.cliOutput).toContain('○ /server')
    expect(next.cliOutput).toContain('○ /client')
    expect(next.cliOutput).toContain('○ /client-page')
    expect(next.cliOutput).toContain('◐ /[dyn]')
    let $

    $ = await next.render$('/server')
    expect($('#id').text().length).toBeGreaterThan(0)

    $ = await next.render$('/client')
    expect($('#id').text().length).toBeGreaterThan(0)

    $ = await next.render$('/client-page')
    expect($('#id').text().length).toBeGreaterThan(0)

    $ = await next.render$('/foo')
    expect($('#id').text().length).toBeGreaterThan(0)

    $ = await next.render$('/serial-client-sync-io')
    expect($('#id').text().length).toBeGreaterThan(0)
  })
})
