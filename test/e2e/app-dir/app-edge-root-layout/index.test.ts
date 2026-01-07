import { nextTestSetup } from 'e2e-utils'

describe('app-dir edge runtime root layout', () => {
  const { next, isNextStart, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should not emit metadata files into bad paths', async () => {
    await next.fetch('/favicon.ico')
    // issue: If metadata files are not filter out properly with image-loader,
    // an incorrect static/media folder will be generated

    // Check that the static folder is not generated
    const incorrectGeneratedStaticFolder = await next.hasFile('static')
    expect(incorrectGeneratedStaticFolder).toBe(false)
  })

  if (isNextStart) {
    it('should mark static contain metadata routes as edge functions', async () => {
      const middlewareManifest = await next.readFile(
        '.next/server/middleware-manifest.json'
      )
      expect(middlewareManifest).not.toContain('/favicon')
    })
  }
})
