import fs from 'fs'
import path from 'path'
import type { NextAdapter } from 'next'
import { nextTestSetup } from 'e2e-utils'
import { version as nextVersion } from 'next/package.json'

process.env.TEST_EXPORT = '1'
process.env.TEST_CACHE_COMPONENTS = '1'

describe('adapter-config export', () => {
  const { next } = nextTestSetup({
    files: path.join(__dirname, 'fixtures/export'),
    skipStart: true,
  })

  it('should call onBuildComplete with correct context', async () => {
    await next.build()
    expect(next.cliOutput).toContain('onBuildComplete called')

    const {
      outputs,
      routing,
      config,
      ...ctx
    }: Parameters<NextAdapter['onBuildComplete']>[0] = await next.readJSON(
      'build-complete.json'
    )

    for (const field of ['distDir', 'projectDir', 'repoRoot']) {
      expect(ctx[field]).toBeString()

      if (!fs.existsSync(ctx[field])) {
        throw new Error(
          `Invalid dir value provided for ${field} value ${ctx[field]}`
        )
      }
    }

    expect(ctx.nextVersion).toBe(nextVersion)
    expect(config?.basePath).toBe('/docs')

    const combinedRouteOutputs = [
      ...outputs.appPages,
      ...outputs.appRoutes,
      ...outputs.pages,
      ...outputs.pagesApi,
    ]

    expect(outputs.middleware).toBeFalsy()
    expect(outputs.prerenders).toEqual([])
    expect(combinedRouteOutputs).toEqual([])

    for (const output of outputs.staticFiles) {
      expect(output.id).toBeTruthy()

      if (output.filePath.endsWith('.html')) {
        expect(output.pathname.endsWith('.html')).toBe(false)
      }
      expect(output.pathname).toStartWith('/docs/')

      const stats = await fs.promises.stat(output.filePath)
      expect(stats.isFile()).toBe(true)
    }

    expect(routing).toEqual({
      beforeMiddleware: expect.toBeArray(),
      middlewareMatchers: expect.toBeArray(),
      beforeFiles: expect.toBeArray(),
      afterFiles: expect.toBeArray(),
      dynamicRoutes: expect.toBeArray(),
      onMatch: expect.toBeArray(),
      fallback: expect.toBeArray(),
      shouldNormalizeNextData: expect.toBeBoolean(),
      rsc: expect.toBeObject(),
    })

    const staticExportFallbackRoute = routing.dynamicRoutes.find(
      (route) => route.destination === '/docs/isr-app/__fallback'
    )
    expect(staticExportFallbackRoute).toEqual(
      expect.objectContaining({
        source: '/isr-app/[slug]',
        destination: '/docs/isr-app/__fallback',
        has: [
          {
            type: 'header',
            key: 'accept',
            value: '.*text/html.*',
          },
        ],
      })
    )

    const staticFilePathnames = new Set(
      outputs.staticFiles.map((output) => output.pathname)
    )
    expect(staticFilePathnames.has('/docs/isr-app/__fallback')).toBe(true)
  })
})
