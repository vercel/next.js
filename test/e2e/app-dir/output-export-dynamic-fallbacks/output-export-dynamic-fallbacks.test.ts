import { nextTestSetup } from 'e2e-utils'
import fs from 'fs-extra'
import { join } from 'path'
import {
  fetchViaHTTP,
  findPort,
  startStaticServer,
  stopApp,
} from 'next-test-utils'

describe('output-export-dynamic-fallbacks', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    skipStart: true,
  })

  it('writes route fallback HTML without emitting fallback RSC data', async () => {
    await next.build()

    const outDir = join(next.testDir, 'out')
    expect(
      await fs.pathExists(join(outDir, 'another', '__fallback.html'))
    ).toBe(true)
    expect(await fs.pathExists(join(outDir, 'another', '__fallback.txt'))).toBe(
      false
    )

    const port = await findPort()
    const app = await startStaticServer(outDir, null, port)

    try {
      const res = await fetchViaHTTP(port, '/another/__fallback.html')
      expect(res.status).toBe(200)
      expect(await res.text()).toContain('Dynamic fallback shell')
    } finally {
      await stopApp(app)
    }
  })
})
