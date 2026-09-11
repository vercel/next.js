import { nextTestSetup, isNextDev, isNextStart } from 'e2e-utils'
// This suite runs next.build() to inspect build output or errors.
// Deploy mode requires a successful deployment and cannot run these local builds.
// @force-gate !deploy
// @force-gate !start || !turbopackDev
// @force-gate !dev || !turbopackBuild
describe('Catches Missing getStaticProps', () => {
  const errorRegex = /getStaticPaths was added without a getStaticProps in/

  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: isNextStart,
  })

  if (isNextDev) {
    it('should catch it in development mode', async () => {
      const html = await next.render('/hello')
      expect(html).toMatch(errorRegex)
    })
  } else {
    it('should catch it in server build mode', async () => {
      const { cliOutput } = await next.build()
      expect(cliOutput).toMatch(errorRegex)
    })
  }
})
