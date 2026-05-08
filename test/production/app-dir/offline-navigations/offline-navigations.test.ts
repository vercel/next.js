import { existsSync } from 'fs'
import { join } from 'path'
import { nextTestSetup } from 'e2e-utils'

describe('offlineNavigations fallback document', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  async function getFallbackDocumentPath() {
    const buildId = (await next.readFile('.next/BUILD_ID')).trim()

    return {
      buildId,
      absolutePath: join(
        next.testDir,
        '.next',
        'static',
        buildId,
        '_offline-navigation-fallback.html'
      ),
      relativePath: `.next/static/${buildId}/_offline-navigation-fallback.html`,
    }
  }

  it('emits a request-invariant fallback document when enabled', async () => {
    const buildResult = await next.build()
    expect(buildResult.exitCode).toBe(0)

    const { buildId, relativePath } = await getFallbackDocumentPath()
    const html = await next.readFile(relativePath)

    expect(html).toContain('data-next-offline-navigation-fallback')
    expect(html).toContain('id="__NEXT_OFFLINE_NAVIGATION_FALLBACK"')
    expect(html).toContain(`"buildId":"${buildId}"`)
    expect(html).toContain('self.__next_f')
    expect(html).toContain('/_next/static/')
    expect(html).not.toContain('offline navigations page')
  })

  it('does not emit a fallback document when disabled', async () => {
    await next.patchFile('next.config.js', (content) =>
      content.replace('offlineNavigations: true', 'offlineNavigations: false')
    )

    const buildResult = await next.build()
    expect(buildResult.exitCode).toBe(0)

    const { absolutePath } = await getFallbackDocumentPath()
    expect(existsSync(absolutePath)).toBe(false)
  })
})
