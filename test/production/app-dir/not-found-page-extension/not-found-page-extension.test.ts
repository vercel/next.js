import { nextTestSetup } from 'e2e-utils'

describe('app dir - not-found with compound pageExtensions', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    buildCommand: 'node node_modules/next/dist/bin/next build',
    skipStart: true,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  beforeAll(async () => {
    await next.build()
  })

  it('should prerender /_not-found and emit its client reference manifest', async () => {
    expect(next.cliOutput).toContain('Compiled successfully')

    const appPathsManifest = JSON.parse(
      await next.readFile('.next/server/app-paths-manifest.json')
    )
    expect(appPathsManifest).toHaveProperty('/_not-found/page')

    const clientReferenceManifest = await next.readFile(
      '.next/server/app/_not-found/page_client-reference-manifest.js'
    )
    expect(clientReferenceManifest).toContain(
      '__RSC_MANIFEST["/_not-found/page"]'
    )
    expect(clientReferenceManifest).toContain('"clientModules"')
  })
})
