import { nextTestSetup } from 'e2e-utils'
import { listClientChunks } from 'next-test-utils'
import path from 'path'

describe('CSS modules ordering — build output (unresolved-css-url)', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: path.join(__dirname, 'fixtures', 'unresolved-css-url'),
    skipStart: true,
    dependencies: {
      sass: '1.54.0',
    },
  })

  it('should build correctly', async () => {
    const { exitCode } = await next.build()
    expect(exitCode).toBe(0)
  })

  it('should have correct file references in CSS output', async () => {
    const distRoot = path.join(next.testDir, next.distDir)
    const cssFiles = (await listClientChunks(distRoot)).filter((f) =>
      f.endsWith('.css')
    )
    expect(cssFiles.length).toBeGreaterThan(0)

    for (const file of cssFiles) {
      const content = await next.readFile(path.join(next.distDir, file))

      const svgCount = content.match(/\(\/vercel\.svg/g)?.length ?? 0
      expect(svgCount === 1 || svgCount === 2).toBe(true)

      if (isTurbopack) {
        const mediaCount = content.match(/\(\.\.\/media/g)?.length ?? 0
        expect(mediaCount === 1 || mediaCount === 2).toBe(true)
      } else {
        expect(
          content.match(/\(\/_next\/static\/(immutable\/)?media/g)?.length
        ).toBe(1)
      }
      const httpsCount = content.match(/\(https:\/\//g)?.length ?? 0
      expect(httpsCount === 1 || httpsCount === 2).toBe(true)
    }
  })
})

describe('CSS modules ordering — build output (data-url)', () => {
  const { next } = nextTestSetup({
    files: path.join(__dirname, 'fixtures', 'data-url'),
    skipStart: true,
  })

  it('should compile successfully', async () => {
    const { exitCode } = await next.build()
    expect(exitCode).toBe(0)
  })

  it('should have emitted expected files', async () => {
    const distRoot = path.join(next.testDir, next.distDir)
    const cssFiles = (await listClientChunks(distRoot)).filter((f) =>
      f.endsWith('.css')
    )

    expect(cssFiles.length).toBe(1)
    const cssContent = await next.readFile(path.join(next.distDir, cssFiles[0]))
    expect(cssContent.replace(/\/\*.*?\*\//g, '').trim()).toMatch(
      /background:url\("?data:[^"]+"?\)/
    )
  })
})
