const assert = require('node:assert/strict')
const Module = require('node:module')
const native = []
const overrides = new Map([
  [
    require.resolve('next/dist/build/swc'),
    {
      createDefineEnv: () => ({}),
      getBindingsSync: () => ({
        turbo: {
          createProject: async (options) => {
            native.push(options)
            return { value: {}, issues: [] }
          },
        },
      }),
    },
  ],
  [
    require.resolve('next/dist/server/app-render/encryption-utils-server'),
    { generateEncryptionKeyBase64: async () => 'fixture-key' },
  ],
  [
    require.resolve('next/dist/build/get-supported-browsers'),
    { getSupportedBrowsers: () => [] },
  ],
  [
    require.resolve('next/dist/shared/lib/turbopack/utils'),
    { isFileSystemCacheEnabledForDev: () => false },
  ],
])
const original = Module._load
Module._load = function (request, parent, isMain) {
  const resolved = Module._resolveFilename(request, parent, isMain)
  return overrides.has(resolved)
    ? overrides.get(resolved)
    : Reflect.apply(original, this, [request, parent, isMain])
}
async function main() {
  try {
    const {
      createDevTurbopackProject,
    } = require('next/dist/build/swc/dev-project')
    const {
      createProductionProjectOptions,
    } = require('next/dist/build/swc/production-project')
    const host = {
      routePrefix: '/__next_testing_layout',
      fixtures: [
        {
          id: 'standalone',
          module: '/application/Counter.jsx',
          exportName: 'default',
        },
        {
          id: 'explicit',
          module: '/application/Counter.jsx',
          exportName: 'default',
          layout: '/application/app/layout.jsx',
        },
      ],
    }
    const config = { turbopack: { root: '/application' }, experimental: {} }
    const rewrites = { beforeFiles: [], afterFiles: [], fallback: [] }
    const previewProps = {
      previewModeId: 'fixture',
      previewModeSigningKey: 'fixture',
      previewModeEncryptionKey: 'fixture',
    }
    await createDevTurbopackProject({
      projectPath: '/application',
      nextConfig: config,
      distDir: '.next/dev',
      fsChecker: { rewrites, previewProps },
      browserFixtureHost: host,
    })
    const production = createProductionProjectOptions({
      dir: '/application',
      distDir: '.next',
      config,
      buildId: 'fixture',
      encryptionKey: 'fixture',
      previewProps,
      rewrites,
      browserFixtureHost: host,
    })
    assert.equal(native.length, 1)
    const dev = JSON.parse(native[0].browserFixtureHost)
    const prod = JSON.parse(production.browserFixtureHost)
    assert.deepEqual(dev, prod)
    assert.deepEqual(dev, {
      ...host,
      fixtures: [
        { ...host.fixtures[0], module: 'Counter.jsx' },
        {
          ...host.fixtures[1],
          module: 'Counter.jsx',
          layout: 'app/layout.jsx',
        },
      ],
    })
    assert.equal(native[0].dev, true)
    assert.equal(production.dev, false)
    assert.equal(native[0].projectPath, '.')
    assert.equal(production.projectPath, '.')
    process.stdout.write(
      JSON.stringify({
        development: dev,
        production: prod,
        actualDevFactoryNativeOptionsCaptured: true,
      }) + '\n'
    )
  } finally {
    Module._load = original
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
