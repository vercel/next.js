import { nextTestSetup } from 'e2e-utils'

async function readRequiredFilesManifest(next: any) {
  const manifest = JSON.parse(
    await next.readFile('.next/required-server-files.json')
  )
  return manifest.files
}

describe('instrumentation - required-files-instrumentation-entry', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should not contain edge entry in required files manifest', async () => {
    const requiredFiles = await readRequiredFilesManifest(next)
    expect(requiredFiles).not.toContain('.next/server/edge-instrumentation.js')
  })
})
