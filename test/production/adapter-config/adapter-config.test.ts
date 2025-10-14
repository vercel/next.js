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
      } else {
        expect(output.pathname).toStartWith('/docs/_next/static')
      }

      const stats = await fs.promises.stat(output.filePath)
      expect(stats.isFile()).toBe(true)
    }

    for (const prerenderOutput of prerenderOutputs) {
      try {
        expect(prerenderOutput.parentOutputId).toBeTruthy()
        if (prerenderOutput.fallback) {
          const stats = await fs.promises.stat(
            prerenderOutput.fallback.filePath
          )
          expect(stats.isFile()).toBe(true)
          expect(prerenderOutput.fallback.initialRevalidate).toBeDefined()
        }

        expect(typeof prerenderOutput.config.bypassToken).toBe('string')
        expect(Array.isArray(prerenderOutput.config.allowHeader)).toBe(true)
        expect(Array.isArray(prerenderOutput.config.allowQuery)).toBe(true)
      } catch (err) {
        require('console').error(`invalid prerender ${prerenderOutput.id}`, err)
        throw err
      }
    }

    for (const route of nodeOutputs) {
      try {
        expect(route.id).toBeString()
        expect(route.config).toBeObject()
        expect(route.pathname).toBeString()
        expect(route.runtime).toBe('nodejs')

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

    for (const route of edgeOutputs) {
      try {
        expect(route.id).toBeString()
        expect(route.config).toBeObject()
        expect(route.pathname).toBeString()
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

    expect(routes).toEqual({
      dynamicRoutes: expect.toBeArray(),
      rewrites: expect.toBeObject(),
      redirects: expect.toBeArray(),
      headers: expect.toBeArray(),
    })
  })
})
