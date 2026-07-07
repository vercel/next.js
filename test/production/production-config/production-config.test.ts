import { nextTestSetup } from 'e2e-utils'

describe('Production Config Usage', () => {
  describe('production mode', () => {
    describe('with generateBuildId', () => {
      const { next, skipped } = nextTestSetup({
        files: __dirname + '/fixture-generateBuildId',
        disableAutoSkewProtection: true,
        skipDeployment: true,
      })
      if (skipped) return

      it('should add the custom buildid', async () => {
        const browser = await next.browser('/')
        const text = await browser.elementByCss('#mounted').text()
        expect(text).toMatch(/ComponentDidMount executed on client\./)

        const html = await browser.eval('document.documentElement.innerHTML')
        expect(html).toMatch('custom-buildid')
        await browser.close()
      })
    })

    describe('env', () => {
      const { next, skipped } = nextTestSetup({
        files: __dirname,
        skipStart: true,
        skipDeployment: true,
      })
      if (skipped) return

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
