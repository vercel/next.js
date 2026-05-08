import { existsSync } from 'fs'
import { join } from 'path'
import { nextTestSetup } from 'e2e-utils'

describe('offlineNavigations build artifacts', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  async function getOfflineNavigationArtifactPaths() {
    const buildId = (await next.readFile('.next/BUILD_ID')).trim()

    return {
      buildId,
      fallbackDocument: {
        absolutePath: join(
          next.testDir,
          '.next',
          'static',
          buildId,
          '_offline-navigation-fallback.html'
        ),
        relativePath: `.next/static/${buildId}/_offline-navigation-fallback.html`,
      },
      manifest: {
        absolutePath: join(
          next.testDir,
          '.next',
          'static',
          buildId,
          '_offline-navigation-manifest.json'
        ),
        relativePath: `.next/static/${buildId}/_offline-navigation-manifest.json`,
      },
    }
  }

  it('emits request-invariant offline navigation artifacts when enabled', async () => {
    const buildResult = await next.build()
    expect(buildResult.exitCode).toBe(0)

    const { buildId, fallbackDocument, manifest } =
      await getOfflineNavigationArtifactPaths()
    const html = await next.readFile(fallbackDocument.relativePath)
    const manifestJson = JSON.parse(await next.readFile(manifest.relativePath))

    expect(html).toContain('data-next-offline-navigation-fallback')
    expect(html).toContain('id="__NEXT_OFFLINE_NAVIGATION_FALLBACK"')
    expect(html).toContain(`"buildId":"${buildId}"`)
    expect(html).toContain('self.__next_f')
    expect(html).toContain('https://cdn.example.com/app-assets/_next/static/')
    expect(html).not.toContain('offline navigations page')

    expect(manifestJson).toEqual({
      version: 1,
      buildId,
      basePath: '/docs',
      assetPrefix: 'https://cdn.example.com/app-assets',
      trailingSlash: true,
      output: 'default',
      scope: '/docs/',
      cacheNamespace: `next-offline-navigation-v1:${buildId}:/docs`,
      manifest: {
        path: `static/${buildId}/_offline-navigation-manifest.json`,
        href: `/docs/_next/static/${buildId}/_offline-navigation-manifest.json`,
      },
      fallbackDocument: {
        path: `static/${buildId}/_offline-navigation-fallback.html`,
        href: `/docs/_next/static/${buildId}/_offline-navigation-fallback.html`,
      },
    })
  })

  it('does not emit offline navigation artifacts when disabled', async () => {
    await next.patchFile('next.config.js', (content) =>
      content.replace('offlineNavigations: true', 'offlineNavigations: false')
    )

    const buildResult = await next.build()
    expect(buildResult.exitCode).toBe(0)

    const { fallbackDocument, manifest } =
      await getOfflineNavigationArtifactPaths()
    expect(existsSync(fallbackDocument.absolutePath)).toBe(false)
    expect(existsSync(manifest.absolutePath)).toBe(false)
  })
})
