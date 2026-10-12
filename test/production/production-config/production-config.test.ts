import { nextTestSetup } from 'e2e-utils'

describe('Production Config Usage', () => {
  describe('production mode', () => {
    // TODO(deploy-test-completion): Re-enable this suite in deploy mode.
    // No deploy-specific incompatibility is documented.
    // @force-gate !deploy
    describe('with generateBuildId', () => {
      const { next } = nextTestSetup({
        files: __dirname + '/fixture-generateBuildId',
        disableAutoSkewProtection: true,
      })

      it('should add the custom buildid', async () => {
        const browser = await next.browser('/')
        const text = await browser.elementByCss('#mounted').text()
        expect(text).toMatch(/ComponentDidMount executed on client\./)

        const html = await browser.eval('document.documentElement.innerHTML')
        expect(html).toMatch('custom-buildid')
        await browser.close()
      })
    })

    // This suite controls the local build lifecycle directly, which deployment tests cannot reproduce.
    // @force-gate !deploy
    describe('env', () => {
      const { next } = nextTestSetup({
        files: __dirname,
        skipStart: true,
      })

      it('should fail with leading __ in env key', async () => {
        const start = next.cliOutput.length
        await next
          .build({ env: { ENABLE_ENV_FAIL_UNDERSCORE: 'true' } })
          .catch(() => {})
        expect(next.cliOutput.slice(start)).toMatch(
          /The key "__NEXT_MY_VAR" under/
        )
      })

      it('should fail with NODE_ in env key', async () => {
        const start = next.cliOutput.length
        await next
          .build({ env: { ENABLE_ENV_FAIL_NODE: 'true' } })
          .catch(() => {})
        expect(next.cliOutput.slice(start)).toMatch(/The key "NODE_ENV" under/)
      })

      it('should fail with NEXT_RUNTIME in env key', async () => {
        const start = next.cliOutput.length
        await next
          .build({ env: { ENABLE_ENV_NEXT_PRESERVED: 'true' } })
          .catch(() => {})
        expect(next.cliOutput.slice(start)).toMatch(
          /The key "NEXT_RUNTIME" under/
        )
      })

      it('should allow __ within env key', async () => {
        const start = next.cliOutput.length
        await next
          .build({ env: { ENABLE_ENV_WITH_UNDERSCORES: 'true' } })
          .catch(() => {})
        expect(next.cliOutput.slice(start)).not.toMatch(
          /The key "SOME__ENV__VAR" under/
        )
      })
    })
  })
})
