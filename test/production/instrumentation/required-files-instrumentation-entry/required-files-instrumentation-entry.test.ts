import { nextTestSetup } from 'e2e-utils'
import { getDistDir } from 'next-test-utils'

async function readRequiredFilesManifest(next: any) {
  const manifest = JSON.parse(
    await next.readFile(getDistDir() + '/required-server-files.json')
  )
  return manifest.files
}

describe('instrumentation - required-files-instrumentation-entry', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should not contain edge entry in required files manifest', async () => {
    const requiredFiles = await readRequiredFilesManifest(next)
    expect(requiredFiles).not.toContain(
      getDistDir() + '/server/edge-instrumentation.js'
    )
  })
})
