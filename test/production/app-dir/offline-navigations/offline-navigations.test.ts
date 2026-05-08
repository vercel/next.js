import { existsSync, readdirSync } from 'fs'
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
      buildStaticDirectory: {
        absolutePath: join(next.testDir, '.next', 'static', buildId),
      },
    }
  }

  function getOfflineNavigationBuildFileNames(directory: string): string[] {
    return readdirSync(directory)
      .filter((entry) => entry.startsWith('_offline-navigation-'))
      .sort()
  }

  it('emits a request-invariant offline navigation fallback document when enabled', async () => {
    const buildResult = await next.build()
    expect(buildResult.exitCode).toBe(0)

    const { buildId, buildStaticDirectory, fallbackDocument } =
      await getOfflineNavigationArtifactPaths()
    const html = await next.readFile(fallbackDocument.relativePath)

    expect(
      getOfflineNavigationBuildFileNames(buildStaticDirectory.absolutePath)
    ).toEqual(['_offline-navigation-fallback.html'])

    expect(html).toContain('data-next-offline-navigation-fallback')
    expect(html).toContain('id="__NEXT_OFFLINE_NAVIGATION_FALLBACK"')
    expect(html).toContain(`"buildId":"${buildId}"`)
    expect(html).not.toContain('"source"')
    expect(html).toContain(
      '<script>(self.__next_f=self.__next_f||[]).push([0])</script>'
    )
    expect(html).toContain('https://cdn.example.com/app-assets/_next/static/')
    expect(html).not.toContain('offline navigations page')
    expect(html).not.toContain('\n')
    expect(html.length).toBeLessThan(4096)
  })

  it('does not emit offline navigation artifacts when disabled', async () => {
    await next.patchFile('next.config.js', (content) =>
      content.replace('offlineNavigations: true', 'offlineNavigations: false')
    )

    const buildResult = await next.build()
    expect(buildResult.exitCode).toBe(0)

    const { buildStaticDirectory, fallbackDocument } =
      await getOfflineNavigationArtifactPaths()
    expect(existsSync(fallbackDocument.absolutePath)).toBe(false)
    expect(
      existsSync(
        join(
          buildStaticDirectory.absolutePath,
          '_offline-navigation-manifest.json'
        )
      )
    ).toBe(false)
  })
})
