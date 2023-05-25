import { createNextDescribe } from 'e2e-utils'
import { check } from 'next-test-utils'

createNextDescribe(
  'app-dir edge runtime root layout',
  {
    files: __dirname,
    skipDeployment: true,
  },
  ({ next, isNextStart }) => {
    it('should not emit metadata files into bad paths', async () => {
      await next.fetch('/favicon.ico')
      const middlewareManifest = await next.readFile(
        '.next/server/middleware-manifest.json'
      )
      expect(middlewareManifest).not.toContain('favicon')
    })

    if (isNextStart) {
      it('should not emit metadata files into bad paths', async () => {
        // issue: If metadata files are not filter out properly with image-loader,
        // an incorrect static/media folder will be generated

        // Check that the static folder is not generated
        const incorrectGeneratedStaticFolder = await next.hasFile('static')
        expect(incorrectGeneratedStaticFolder).toBe(false)
      })
    }
  }
)
