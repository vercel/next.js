import { spawnSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const nextPackageDir = path.join(__dirname, '../../../packages/next')
const distDir = path.join(nextPackageDir, 'dist')
const productionRuntimeDir = path.join(distDir, 'compiled/next-server')
const entrypoints = [
  'server/base-server.js',
  'server/lib/router-server.js',
  'server/app-render/app-render.js',
  'server/route-modules/app-route/module.js',
  'server/lib/patch-fetch.js',
  'server/next-server.js',
]

function probeLoadedRequestInsightsModules() {
  const script = String.raw`
    const path = require('node:path')
    const distDir = process.argv[1]
    const entrypoints = JSON.parse(process.argv[2])
    const results = []

    async function main() {
      for (const entrypoint of entrypoints) {
        for (const modulePath of Object.keys(require.cache)) {
          delete require.cache[modulePath]
        }

        delete process.env.__NEXT_DEV_SERVER

        const entrypointModule = require(path.join(distDir, entrypoint))
        if (entrypoint === 'server/lib/patch-fetch.js') {
          const originalFetch = globalThis.fetch
          entrypointModule.patchFetch({
            workAsyncStorage: { getStore: () => undefined },
            workUnitAsyncStorage: { getStore: () => undefined },
          })
          const response = await globalThis.fetch(
            'data:text/plain,request-insights-dce-probe'
          )
          await response.text()
          globalThis.fetch = originalFetch
          delete globalThis[Symbol.for('next-patch')]
        }
        results.push({
          entrypoint,
          modules: Object.keys(require.cache)
            .map((modulePath) =>
              path.relative(distDir, modulePath).split(path.sep).join('/')
            )
            .filter((modulePath) => modulePath.includes('request-insights')),
        })
      }

      process.stdout.write(JSON.stringify(results))
    }

    main().catch((error) => {
      console.error(error)
      process.exit(1)
    })
  `
  const result = spawnSync(
    process.execPath,
    ['-e', script, distDir, JSON.stringify(entrypoints)],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        __NEXT_DEV_SERVER: '',
      },
    }
  )

  if (result.status !== 0) {
    throw new Error(result.stderr || `module probe exited ${result.status}`)
  }

  return JSON.parse(result.stdout) as Array<{
    entrypoint: string
    modules: string[]
  }>
}

describe('Request Insights production module graph', () => {
  it('does not load dev-only Request Insights modules in production', () => {
    expect(probeLoadedRequestInsightsModules()).toEqual(
      entrypoints.map((entrypoint) => ({
        entrypoint,
        modules: [],
      }))
    )
  })

  it('excludes the controller runtime from fresh app production bundles', () => {
    const sourceMtime = Math.max(
      statSync(
        path.join(nextPackageDir, 'src/server/lib/trace/local-span-recorder.ts')
      ).mtimeMs,
      statSync(
        path.join(
          nextPackageDir,
          'src/server/route-modules/app-route/module.ts'
        )
      ).mtimeMs,
      statSync(
        path.join(
          nextPackageDir,
          'src/server/lib/trace/request-insights-response.ts'
        )
      ).mtimeMs
    )
    const runtimeArtifacts = readdirSync(productionRuntimeDir)
      .filter((filename) =>
        /^app-(?:page|route).*\.runtime\.prod\.js$/.test(filename)
      )
      .sort()

    expect(runtimeArtifacts).toEqual([
      'app-page-experimental.runtime.prod.js',
      'app-page-turbo-experimental.runtime.prod.js',
      'app-page-turbo.runtime.prod.js',
      'app-page.runtime.prod.js',
      'app-route-experimental.runtime.prod.js',
      'app-route-turbo-experimental.runtime.prod.js',
      'app-route-turbo.runtime.prod.js',
      'app-route.runtime.prod.js',
    ])

    for (const filename of runtimeArtifacts) {
      const artifactPath = path.join(productionRuntimeDir, filename)
      expect(statSync(artifactPath).mtimeMs).toBeGreaterThanOrEqual(sourceMtime)

      const contents = readFileSync(artifactPath, 'utf8')
      expect(contents).not.toContain('request-insights-runtime')
      expect(contents).not.toContain('request-insights-response')
      expect(contents).not.toContain('@next/request-insights-runtime-storage')
    }
  })
})
