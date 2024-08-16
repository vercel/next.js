import { nextTestSetup } from 'e2e-utils'
import path from 'path'

async function readRequiredFilesManifest(next: any) {
  const manifest = JSON.parse(
    await next.readFile('.next/required-server-files.json')
  )
  return manifest.files
}

describe('instrumentation - required-files-instrumentation-entry', () => {
  describe('node-app', () => {
    const { next } = nextTestSetup({
      files: path.join(__dirname, 'node-app'),
    })

    it('should not contain edge entry in required files manifest', async () => {
      const requiredFiles = await readRequiredFilesManifest(next)
      expect(requiredFiles).not.toContain(
        '.next/server/edge-instrumentation.js'
      )
    })
  })
})
