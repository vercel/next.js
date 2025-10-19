import fs from 'fs'
import type { NextAdapter } from 'next'
import { nextTestSetup } from 'e2e-utils'
import { version as nextVersion } from 'next/package.json'

process.env.TEST_EXPORT = '1'

describe('adapter-config export', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('should call onBuildComplete with correct context', async () => {
    const nonExportFiles = [
      'app/node-app/page.tsx',
      'app/node-route/route.ts',
      'app/edge-route/route.ts',
      'app/isr-route/route.ts',
      'app/isr-route/[slug]/route.ts',
      'app/edge-app/page.tsx',
      'pages/api/edge-pages.ts',
      'pages/api/node-pages.ts',
      'pages/edge-pages/index.tsx',
      'pages/node-pages/index.tsx',
    ]

    for (const file of nonExportFiles) {
      await next.remove(file)
    }

    await next.build()
    expect(next.cliOutput).toContain('onBuildComplete called')

    const {
      outputs,
      routes,
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

    expect(routes).toEqual({
      dynamicRoutes: expect.toBeArray(),
      rewrites: expect.toBeObject(),
      redirects: expect.toBeArray(),
      headers: expect.toBeArray(),
    })
  })
})
