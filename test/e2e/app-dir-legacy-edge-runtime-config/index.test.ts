import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'app-dir edge runtime config',
  {
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  },
  ({ next, isNextDev }) => {
    it('should warn the legacy object config export', async () => {
      let error
      await next.start().catch((err) => {
        error = err
      })
      if (isNextDev) {
        expect(error).not.toBeDefined()
        await next.fetch('/legacy-runtime-config')
      } else {
        expect(error).toBeDefined()
      }
      expect(next.cliOutput).toContain('`export const config` in')
      expect(next.cliOutput).toContain(
        // the full path is more complex, we only care about this part
        'app/legacy-runtime-config/page.js is deprecated'
      )
      expect(next.cliOutput).toContain(
        '- Change `config.runtime…` to `export const runtime = "edge"'
      )
      expect(next.cliOutput).toContain(
        '- Change `config.regions…` to `export const preferredRegion = ["us-east-1"]`'
      )
    })
  }
)
