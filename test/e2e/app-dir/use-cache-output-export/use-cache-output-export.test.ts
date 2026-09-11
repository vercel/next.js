import { nextTestSetup } from 'e2e-utils'
import { renderViaHTTP, startCleanStaticServer } from 'next-test-utils'
import { join } from 'path'
import { AddressInfo, Server } from 'net'

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// It likely asserts local CLI or runtime output that deploy tests do not expose.
// @force-gate !deploy
describe('use-cache-output-export', () => {
  const { next, isNextStart } = nextTestSetup({
    files: __dirname,
    skipStart: process.env.NEXT_TEST_MODE !== 'dev',
  })

  if (process.env.__NEXT_CACHE_COMPONENTS === 'true') {
    return it.skip('for PPR', () => {
      // PPR is not compatible with `output: 'export'`.
    })
  }

  it('should work', async () => {
    let html: string
    let server: Server | undefined

    if (isNextStart) {
      const { cliOutput } = await next.build()

      expect(cliOutput).not.toInclude(
        'Server Actions are not supported with static export.'
      )

      server = await startCleanStaticServer(join(next.testDir, 'out'))
      const { port } = server.address() as AddressInfo
      html = await renderViaHTTP(port, '/')
    } else {
      html = await next.render('/')
    }

    expect(html).toMatch(/<p>[0,1]\.\d+<\/p>/)

    if (server) {
      await new Promise((resolve) => server.close(resolve))
    }
  })
})
