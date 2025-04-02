import { nextTestSetup } from 'e2e-utils'
describe('turbopack-build-marker', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should have Turbopack build marker', async () => {
    const requiredServerFilesManifest = await next.readJSON(
      '.next/required-server-files.json'
    )
    expect(requiredServerFilesManifest.turbopack).toBe(!!process.env.TURBOPACK)
  })
})
