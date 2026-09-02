import { nextTestSetup } from 'e2e-utils'

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// It likely mutates files in the isolated local fixture after setup.
// @force-gate !deploy
describe('app dir - not-found - group route', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  const runTests = () => {
    it('should use the not-found page under group routes', async () => {
      const browser = await next.browser('/blog')
      expect(await browser.elementByCss('h1').text()).toContain('Group Layout')
      expect(await browser.elementByCss('#not-found').text()).toContain(
        'Not found!'
      )
    })
  }

  describe('with default runtime', () => {
    runTests()
  })

  describe('with runtime = edge', () => {
    let originalLayout = ''

    beforeAll(async () => {
      await next.stop()
      originalLayout = await next.readFile('app/layout.js')
      await next.patchFile(
        'app/layout.js',
        `export const runtime = 'edge'\n${originalLayout}`
      )
      await next.start()
    })
    afterAll(async () => {
      await next.patchFile('app/layout.js', originalLayout)
    })

    runTests()
  })
})
