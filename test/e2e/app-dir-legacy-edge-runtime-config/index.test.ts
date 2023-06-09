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
      expect(next.cliOutput).toContain('`export const config`')
      expect(next.cliOutput).toContain(
        'app/legacy-runtime-config/page.js is deprecated. Please change `runtime` property to segment export config. See https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config'
      )
    })
  }
)
