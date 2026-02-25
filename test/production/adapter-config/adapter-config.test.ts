import fs from 'fs'
import { nextTestSetup } from 'e2e-utils'
import type { AdapterOutput, NextAdapter } from 'next'
import { version as nextVersion } from 'next/package.json'

describe('adapter-config', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should apply modifyConfig from adapter', async () => {
    // we apply basePath of "/docs" to ensure modify was called
    const res = await next.fetch('/')
    expect(res.status).toBe(404)

    const res2 = await next.fetch('/docs/node-pages')
    expect(res2.status).toBe(200)
    expect(await res2.text()).toContain('hello world')

    expect(next.cliOutput).toContain('called modify config in adapter')
  })

  it('should call onBuildComplete with correct context', async () => {
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

    type PageRoutesType =
      | AdapterOutput['APP_PAGE']
      | AdapterOutput['APP_ROUTE']
      | AdapterOutput['PAGES']
      | AdapterOutput['PAGES_API']

    const outputMap = new Map<string, PageRoutesType>()
    const prerenderOutputs: AdapterOutput['PRERENDER'][] = outputs.prerenders
    const staticOutputs: AdapterOutput['STATIC_FILE'][] = outputs.staticFiles
    const nodeOutputs: PageRoutesType[] = []
    const edgeOutputs: PageRoutesType[] = []

    for (const routeOutput of combinedRouteOutputs) {
      if (outputMap.has(routeOutput.id)) {
        require('console').error({
          existingOutput: outputMap.get(routeOutput.id),
          newOutput: routeOutput,
        })
        throw new Error(`duplicate id on route outputs ${routeOutput.id}`)
      }
      outputMap.set(routeOutput.id, routeOutput)

      if (routeOutput.runtime === 'edge') {
        edgeOutputs.push(routeOutput)
      } else if (routeOutput.runtime === 'nodejs') {
        nodeOutputs.push(routeOutput)
      } else {
        require('console').error(routeOutput)
        throw new Error(`Unexpected runtime on output ${routeOutput.runtime}`)
      }
    }

    expect(nodeOutputs.length).toBeGreaterThan(0)
    expect(edgeOutputs.length).toBeGreaterThan(0)
    expect(staticOutputs.length).toBeGreaterThan(0)
    expect(prerenderOutputs.length).toBeGreaterThan(0)

    for (const output of staticOutputs) {
      expect(output.id).toBeTruthy()

      if (output.filePath.endsWith('.html')) {
        expect(output.pathname.endsWith('.html')).toBe(false)
      } else if (output.pathname.endsWith('.rsc')) {
        expect(output.filePath.endsWith('rsc-fallback.json')).toBe(true)
      } else if (output.filePath.endsWith('.body')) {
        // Static metadata files (e.g., /icon.png, /manifest.json, /sitemap.xml) are output as static files
        expect(output.pathname).toMatch(
          /\.(png|jpg|jpeg|ico|svg|gif|json|webmanifest|xml|txt)$/
        )
      } else {
        expect(output.pathname).toStartWith('/docs/_next/static')
      }
      // ensure / -> /index normalizing is correct
      expect(output.pathname.includes('/.')).toBe(false)

      const stats = await fs.promises.stat(output.filePath)
      expect(stats.isFile()).toBe(true)
    }

    // Verify static metadata files are output as static files, not prerenders
    // Test icon.png
    const iconStaticFile = staticOutputs.find(
      (item) => item.pathname === '/docs/icon.png'
    )
    expect(iconStaticFile).toBeDefined()
    expect(iconStaticFile?.filePath).toMatch(/\.body$/)

    // Static metadata images should NOT be in prerenders
    const iconPrerender = prerenderOutputs.find(
      (item) => item.pathname === '/docs/icon.png'
    )
    expect(iconPrerender).toBeUndefined()

    // Static metadata images should NOT be in appRoutes
    const iconAppRoute = outputs.appRoutes.find(
      (item) =>
        item.pathname === '/docs/icon.png' ||
        item.pathname === '/docs/icon.png.rsc'
    )
    expect(iconAppRoute).toBeUndefined()

    // Test favicon.ico
    const faviconStaticFile = staticOutputs.find(
      (item) => item.pathname === '/docs/favicon.ico'
    )
    expect(faviconStaticFile).toBeDefined()
    expect(faviconStaticFile?.filePath).toMatch(/\.body$/)

    const faviconPrerender = prerenderOutputs.find(
      (item) => item.pathname === '/docs/favicon.ico'
    )
    expect(faviconPrerender).toBeUndefined()

    const faviconAppRoute = outputs.appRoutes.find(
      (item) =>
        item.pathname === '/docs/favicon.ico' ||
        item.pathname === '/docs/favicon.ico.rsc'
    )
    expect(faviconAppRoute).toBeUndefined()

    // Test opengraph-image.png
    const ogImageStaticFile = staticOutputs.find(
      (item) => item.pathname === '/docs/opengraph-image.png'
    )
    expect(ogImageStaticFile).toBeDefined()
    expect(ogImageStaticFile?.filePath).toMatch(/\.body$/)

    const ogImagePrerender = prerenderOutputs.find(
      (item) => item.pathname === '/docs/opengraph-image.png'
    )
    expect(ogImagePrerender).toBeUndefined()

    const ogImageAppRoute = outputs.appRoutes.find(
      (item) =>
        item.pathname === '/docs/opengraph-image.png' ||
        item.pathname === '/docs/opengraph-image.png.rsc'
    )
    expect(ogImageAppRoute).toBeUndefined()

    // Test manifest.json
    const manifestStaticFile = staticOutputs.find(
      (item) => item.pathname === '/docs/manifest.json'
    )
    expect(manifestStaticFile).toBeDefined()
    expect(manifestStaticFile?.filePath).toMatch(/\.body$/)

    const manifestPrerender = prerenderOutputs.find(
      (item) => item.pathname === '/docs/manifest.json'
    )
    expect(manifestPrerender).toBeUndefined()

    const manifestAppRoute = outputs.appRoutes.find(
      (item) =>
        item.pathname === '/docs/manifest.json' ||
        item.pathname === '/docs/manifest.json.rsc'
    )
    expect(manifestAppRoute).toBeUndefined()

    // Test sitemap.xml
    const sitemapStaticFile = staticOutputs.find(
      (item) => item.pathname === '/docs/sitemap.xml'
    )
    expect(sitemapStaticFile).toBeDefined()
    expect(sitemapStaticFile?.filePath).toMatch(/\.body$/)

    const sitemapPrerender = prerenderOutputs.find(
      (item) => item.pathname === '/docs/sitemap.xml'
    )
    expect(sitemapPrerender).toBeUndefined()

    const sitemapAppRoute = outputs.appRoutes.find(
      (item) =>
        item.pathname === '/docs/sitemap.xml' ||
        item.pathname === '/docs/sitemap.xml.rsc'
    )
    expect(sitemapAppRoute).toBeUndefined()

    // Test robots.txt
    const robotsStaticFile = staticOutputs.find(
      (item) => item.pathname === '/docs/robots.txt'
    )
    expect(robotsStaticFile).toBeDefined()
    expect(robotsStaticFile?.filePath).toMatch(/\.body$/)

    const robotsPrerender = prerenderOutputs.find(
      (item) => item.pathname === '/docs/robots.txt'
    )
    expect(robotsPrerender).toBeUndefined()

    const robotsAppRoute = outputs.appRoutes.find(
      (item) =>
        item.pathname === '/docs/robots.txt' ||
        item.pathname === '/docs/robots.txt.rsc'
    )
    expect(robotsAppRoute).toBeUndefined()

    for (const prerenderOutput of prerenderOutputs) {
      try {
        expect(prerenderOutput.parentOutputId).toBeTruthy()
        if (prerenderOutput.fallback) {
          if (
            'filePath' in prerenderOutput.fallback &&
            prerenderOutput.fallback.filePath
          ) {
            const stats = await fs.promises.stat(
              prerenderOutput.fallback.filePath
            )
            expect(stats.isFile()).toBe(true)
          }
          expect(prerenderOutput.fallback.initialRevalidate).toBeDefined()
        }

        expect(typeof prerenderOutput.config.bypassToken).toBe('string')
        expect(Array.isArray(prerenderOutput.config.allowHeader)).toBe(true)
        expect(Array.isArray(prerenderOutput.config.allowQuery)).toBe(true)
        // ensure / -> /index normalizing is correct
        expect(prerenderOutput.pathname.includes('/.')).toBe(false)
      } catch (err) {
        require('console').error(`invalid prerender ${prerenderOutput.id}`, err)
        throw err
      }
    }

    const indexPrerender = prerenderOutputs.find(
      (item) => item.pathname === '/docs'
    )

    expect(indexPrerender?.fallback?.initialHeaders).toEqual({
      'content-type': 'text/html; charset=utf-8',
      vary: 'rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch',
      'x-next-cache-tags': '_N_T_/layout,_N_T_/page,_N_T_/,_N_T_/index',
      'x-nextjs-prerender': '1',
      'x-nextjs-stale-time': '300',
    })
    expect(indexPrerender?.fallback?.initialRevalidate).toBe(false)

    for (const route of nodeOutputs) {
      try {
        expect(route.id).toBeString()
        expect(route.config).toBeObject()
        expect(route.pathname).toBeString()
        expect(route.runtime).toBe('nodejs')
        // ensure / -> /index normalizing is correct
        expect(route.pathname.includes('/.')).toBe(false)

        const stats = await fs.promises.stat(route.filePath)
        expect(stats.isFile()).toBe(true)

        const missingAssets: string[] = []

        for (const filePath of Object.values(route.assets)) {
          if (!fs.existsSync(filePath)) {
            missingAssets.push(filePath)
          }
        }

        expect(missingAssets).toEqual([])
      } catch (err) {
        require('console').error(`Invalid fields for ${route.id}`, route, err)
        throw err
      }
    }

    // Verify vendored context files are traced in assets for app-page and pages outputs
    const appPageOutput = outputs.appPages.find(
      (output) =>
        output.pathname === '/docs/node-app' && output.runtime === 'nodejs'
    )
    const pagesOutput = outputs.pages.find(
      (output) =>
        output.pathname === '/docs/node-pages' && output.runtime === 'nodejs'
    )

    expect(appPageOutput).toBeDefined()
    expect(pagesOutput).toBeDefined()

    // Check that vendored context files are included in assets
    const appPageAssets = Object.values(appPageOutput!.assets)
    const pagesAssets = Object.values(pagesOutput!.assets)

    const appPageVendoredContexts = appPageAssets.filter((asset) =>
      asset.includes('vendored/contexts/')
    )
    const pagesVendoredContexts = pagesAssets.filter((asset) =>
      asset.includes('vendored/contexts/')
    )

    // app-page should have vendored context files traced
    expect(appPageVendoredContexts.length).toBeGreaterThan(0)
    // pages should have vendored context files traced
    expect(pagesVendoredContexts.length).toBeGreaterThan(0)

    for (const route of edgeOutputs) {
      try {
        expect(route.id).toBeString()
        expect(route.config).toBeObject()
        expect(route.pathname).toBeString()
        // ensure / -> /index normalizing is correct
        expect(route.pathname.includes('/.')).toBe(false)
        expect(route.runtime).toBe('edge')
        expect(route.config.env).toEqual(
          expect.objectContaining({
            NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: expect.toBeString(),
            __NEXT_BUILD_ID: expect.toBeString(),
            __NEXT_PREVIEW_MODE_ENCRYPTION_KEY: expect.toBeString(),
            __NEXT_PREVIEW_MODE_ID: expect.toBeString(),
            __NEXT_PREVIEW_MODE_SIGNING_KEY: expect.toBeString(),
          })
        )

        const stats = await fs.promises.stat(route.filePath)
        expect(stats.isFile()).toBe(true)

        const missingAssets: string[] = []

        for (const filePath of Object.values(route.assets)) {
          if (!fs.existsSync(filePath)) {
            missingAssets.push(filePath)
          }
        }

        expect(missingAssets).toEqual([])
      } catch (err) {
        require('console').error(`Invalid fields for ${route.id}`, route, err)
        throw err
      }
    }

    expect(routing).toEqual({
      beforeMiddleware: expect.toBeArray(),
      beforeFiles: expect.toBeArray(),
      afterFiles: expect.toBeArray(),
      dynamicRoutes: expect.toBeArray(),
      onMatch: expect.toBeArray(),
      fallback: expect.toBeArray(),
      shouldNormalizeNextData: expect.toBeBoolean(),
      rsc: expect.toBeObject(),
    })
  })
})
