/* eslint-env jest */
/* global jasmine */
import path from 'path'
import fs from 'fs-extra'
import {
  runNextCommand,
  launchApp,
  findPort,
  killApp,
  waitFor,
} from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 2

const appDir = path.join(__dirname, '..')
const nextConfig = path.join(appDir, 'next.config.js')
const pagesDir = path.join(appDir, 'pages')
const testsDir = path.join(pagesDir, '__tests__')
const generatedDir = path.join(pagesDir, '__generated__')

describe('Telemetry CLI', () => {
  it('can print telemetry status', async () => {
    const { stdout } = await runNextCommand(['telemetry'], {
      stdout: true,
    })
    expect(stdout).toMatch(/Status: .*/)
  })

  it('can enable telemetry with flag', async () => {
    const { stdout } = await runNextCommand(['telemetry', '--enable'], {
      stdout: true,
    })
    expect(stdout).toMatch(/Success/)
    expect(stdout).toMatch(/Status: Enabled/)
  })

  it('can disable telemetry with flag', async () => {
    const { stdout } = await runNextCommand(['telemetry', '--disable'], {
      stdout: true,
    })
    expect(stdout).toMatch(/Your preference has been saved/)
    expect(stdout).toMatch(/Status: Disabled/)
  })

  it('can enable telemetry without flag', async () => {
    const { stdout } = await runNextCommand(['telemetry', 'enable'], {
      stdout: true,
    })
    expect(stdout).toMatch(/Success/)
    expect(stdout).toMatch(/Status: Enabled/)
  })

  it('can re-enable telemetry', async () => {
    const { stdout } = await runNextCommand(['telemetry', 'enable'], {
      stdout: true,
    })
    expect(stdout).toMatch(/Success/)
    expect(stdout).toMatch(/Status: Enabled/)
  })

  it('can disable telemetry without flag', async () => {
    const { stdout } = await runNextCommand(['telemetry', 'disable'], {
      stdout: true,
    })
    expect(stdout).toMatch(/Your preference has been saved/)
    expect(stdout).toMatch(/Status: Disabled/)
  })

  it('can re-disable telemetry', async () => {
    const { stdout } = await runNextCommand(['telemetry', 'disable'], {
      stdout: true,
    })
    expect(stdout).toMatch(/already disabled/)
    expect(stdout).toMatch(/Status: Disabled/)
  })

  it('detects isSrcDir dir correctly for `next build`', async () => {
    const { stderr } = await runNextCommand(['build', appDir], {
      stderr: true,
      env: {
        NEXT_TELEMETRY_DEBUG: 1,
      },
    })

    expect(stderr).toMatch(/isSrcDir.*?false/)

    await fs.move(path.join(appDir, 'pages'), path.join(appDir, 'src/pages'))
    const { stderr: stderr2 } = await runNextCommand(['build', appDir], {
      stderr: true,
      env: {
        NEXT_TELEMETRY_DEBUG: 1,
      },
    })
    await fs.move(path.join(appDir, 'src/pages'), path.join(appDir, 'pages'))

    expect(stderr2).toMatch(/isSrcDir.*?true/)
  })

  it('detects isSrcDir dir correctly for `next dev`', async () => {
    let port = await findPort()
    let stderr = ''

    const handleStderr = msg => {
      stderr += msg
    }
    let app = await launchApp(appDir, port, {
      onStderr: handleStderr,
      env: {
        NEXT_TELEMETRY_DEBUG: 1,
      },
    })
    await waitFor(1000)
    await killApp(app)
    expect(stderr).toMatch(/isSrcDir.*?false/)

    await fs.move(path.join(appDir, 'pages'), path.join(appDir, 'src/pages'))
    stderr = ''

    port = await findPort()
    app = await launchApp(appDir, port, {
      onStderr: handleStderr,
      env: {
        NEXT_TELEMETRY_DEBUG: 1,
      },
    })
    await waitFor(1000)
    await killApp(app)
    await fs.move(path.join(appDir, 'src/pages'), path.join(appDir, 'pages'))

    expect(stderr).toMatch(/isSrcDir.*?true/)
  })

  it('detects unused configs for `next dev`', async () => {
    let stderr = ''
    const port = await findPort()
    const app = await launchApp(appDir, port, {
      onStderr: msg => {
        stderr += msg
      },
      env: {
        NEXT_TELEMETRY_DEBUG: 1,
      },
    })

    await waitFor(1000)
    await killApp(app)

    expect(stderr).toMatch(/target.*?null/)
    expect(stderr).toMatch(/hasTypescript.*?false/)
    expect(stderr).toMatch(/hasCustomWebpack.*?false/)
    expect(stderr).toMatch(/hasCustomWebpackDev.*?false/)
    expect(stderr).toMatch(/hasAssetPrefix.*?false/)
    expect(stderr).toMatch(/hasDistDir.*?false/)
    expect(stderr).toMatch(/hasCustomBuildId.*?false/)
    expect(stderr).toMatch(/hasRuntimeConfig.*?false/)
    expect(stderr).toMatch(/hasReactStrictMode.*?false/)
    expect(stderr).toMatch(/hasRewrites.*?false/)
    expect(stderr).toMatch(/hasRedirects.*?false/)
    expect(stderr).toMatch(/hasTrailingSlash.*?false/)
    expect(stderr).toMatch(/hasExportPathMap.*?false/)
    expect(stderr).toMatch(/pageExtensions.*?null/)
  })

  it('detects custom configs in next.config.js for `next dev`', async () => {
    await fs.writeFile(
      nextConfig,
      `
      module.exports = {
        target: 'server',
        webpack: config => config,
        webpackDevMiddleware: config => config,
        assetPrefix: 'prefix',
        generateBuildId: () => null,
        publicRuntimeConfig: { key: 'value' },
        reactStrictMode: true,
        exportTrailingSlash: true,
        exportPathMap: defaultMap => defaultMap,
        experimental: {
          async rewrites() {
            return [{ source: '/', destination: '/' }]
          },
          async redirects() {
            return [{ source: '/', destination: '/', statusCode: 301 }]
          }
        }
      }
    `
    )

    let stderr = ''
    const port = await findPort()
    const app = await launchApp(appDir, port, {
      onStderr: msg => {
        stderr += msg
      },
      env: {
        NEXT_TELEMETRY_DEBUG: 1,
      },
    })

    await waitFor(1000)
    await killApp(app)
    await fs.remove(nextConfig)

    expect(stderr).toMatch(/target.*?server/)
    expect(stderr).toMatch(/hasCustomWebpack.*?true/)
    expect(stderr).toMatch(/hasCustomWebpackDev.*?true/)
    expect(stderr).toMatch(/hasAssetPrefix.*?true/)
    expect(stderr).toMatch(/hasCustomBuildId.*?true/)
    expect(stderr).toMatch(/hasRuntimeConfig.*?true/)
    expect(stderr).toMatch(/hasReactStrictMode.*?true/)
    expect(stderr).toMatch(/hasRewrites.*?true/)
    expect(stderr).toMatch(/hasRedirects.*?true/)
    expect(stderr).toMatch(/hasTrailingSlash.*?true/)
    expect(stderr).toMatch(/hasExportPathMap.*?true/)
  })

  it('detects TypeScript correctly for `next dev`', async () => {
    const file = path.join(pagesDir, 'about.tsx')

    await fs.writeFile(file, `export default () => null`)

    let stderr = ''
    const port = await findPort()
    const app = await launchApp(appDir, port, {
      onStderr: msg => {
        stderr += msg
      },
      env: {
        NEXT_TELEMETRY_DEBUG: 1,
      },
    })

    await waitFor(1000)
    await killApp(app)
    await fs.remove(file)
    await fs.remove(path.join(appDir, 'tsconfig.json'))

    expect(stderr).toMatch(/hasTypescript.*?true/)
  })

  it('detects test files correctly for `next build`', async () => {
    const testDir = path.join(pagesDir, 'test')

    await fs.ensureDir(testDir)
    await fs.writeFile(
      path.join(testDir, 'index.test.js'),
      `export default () => null`
    )

    const { stderr } = await runNextCommand(['build', appDir], {
      stderr: true,
      env: {
        NEXT_TELEMETRY_DEBUG: 1,
      },
    })

    await fs.remove(testDir)

    const buildId = await fs.readFile(
      path.join(appDir, '.next/BUILD_ID'),
      'utf8'
    )
    // Remove the generated test file or tests will break at a second run
    await fs.remove(path.join(appDir, '.next/static', buildId))

    expect(stderr).toMatch(/hasInvalidPages.*?true/)
  })

  it('detects tests in __tests__ correctly for `next build`', async () => {
    await fs.ensureDir(testsDir)
    await fs.writeFile(
      path.join(testsDir, 'index.js'),
      `export default () => null`
    )

    const { stderr } = await runNextCommand(['build', appDir], {
      stderr: true,
      env: {
        NEXT_TELEMETRY_DEBUG: 1,
      },
    })

    await fs.remove(testsDir)

    expect(stderr).toMatch(/hasInvalidPages.*?true/)
  })

  it('detects __generated__ correctly for `next build`', async () => {
    await fs.ensureDir(generatedDir)
    await fs.writeFile(
      path.join(generatedDir, 'query.graphql.js'),
      `export default () => null`
    )

    const { stderr } = await runNextCommand(['build', appDir], {
      stderr: true,
      env: {
        NEXT_TELEMETRY_DEBUG: 1,
      },
    })

    await fs.remove(generatedDir)

    expect(stderr).toMatch(/hasInvalidPages.*?true/)
  })

  it('detects TypeScript correctly for `next build`', async () => {
    const file = path.join(pagesDir, 'about.tsx')

    await fs.writeFile(file, `export default () => null`)

    const { stderr } = await runNextCommand(['build', appDir], {
      stderr: true,
      env: {
        NEXT_TELEMETRY_DEBUG: 1,
      },
    })

    await fs.remove(file)
    await fs.remove(path.join(appDir, 'tsconfig.json'))

    expect(stderr).toMatch(/hasTypescript.*?true/)
  })

  it('detects unused configs for `next build`', async () => {
    const { stderr } = await runNextCommand(['build', appDir], {
      stderr: true,
      env: {
        NEXT_TELEMETRY_DEBUG: 1,
      },
    })

    expect(stderr).toMatch(/target.*?null/)
    expect(stderr).toMatch(/hasCustomWebpack.*?false/)
    expect(stderr).toMatch(/hasCustomWebpackDev.*?false/)
    expect(stderr).toMatch(/hasAssetPrefix.*?false/)
    expect(stderr).toMatch(/hasDistDir.*?false/)
    expect(stderr).toMatch(/hasCustomBuildId.*?false/)
    expect(stderr).toMatch(/hasRuntimeConfig.*?false/)
    expect(stderr).toMatch(/hasReactStrictMode.*?false/)
    expect(stderr).toMatch(/hasRewrites.*?false/)
    expect(stderr).toMatch(/hasRedirects.*?false/)
    expect(stderr).toMatch(/pageExtensions.*?null/)
  })

  it('detects custom configs in next.config.js for `next build`', async () => {
    await fs.writeFile(
      nextConfig,
      `
      module.exports = {
        target: 'server',
        webpack: config => config,
        webpackDevMiddleware: config => config,
        assetPrefix: 'prefix',
        generateBuildId: () => null,
        publicRuntimeConfig: { key: 'value' },
        reactStrictMode: true,
        experimental: {
          async rewrites() {
            return [{ source: '/', destination: '/' }]
          },
          async redirects() {
            return [{ source: '/', destination: '/', statusCode: 301 }]
          }
        }
      }
    `
    )

    const { stderr } = await runNextCommand(['build', appDir], {
      stderr: true,
      env: {
        NEXT_TELEMETRY_DEBUG: 1,
      },
    })

    await fs.remove(nextConfig)

    expect(stderr).toMatch(/target.*?server/)
    expect(stderr).toMatch(/hasCustomWebpack.*?true/)
    expect(stderr).toMatch(/hasCustomWebpackDev.*?true/)
    expect(stderr).toMatch(/hasAssetPrefix.*?true/)
    expect(stderr).toMatch(/hasCustomBuildId.*?true/)
    expect(stderr).toMatch(/hasRuntimeConfig.*?true/)
    expect(stderr).toMatch(/hasReactStrictMode.*?true/)
    expect(stderr).toMatch(/hasRewrites.*?true/)
    expect(stderr).toMatch(/hasRedirects.*?true/)
  })

  it('detects runtime config if serverRuntimeConfig is set for `next build`', async () => {
    await fs.writeFile(
      nextConfig,
      `module.exports = { serverRuntimeConfig: { key: 'value' } }`
    )

    const { stderr } = await runNextCommand(['build', appDir], {
      stderr: true,
      env: {
        NEXT_TELEMETRY_DEBUG: 1,
      },
    })

    await fs.remove(nextConfig)

    expect(stderr).toMatch(/hasRuntimeConfig.*?true/)
  })

  it('detects custom distDir for `next build`', async () => {
    await fs.writeFile(nextConfig, `module.exports = { distDir: 'dist' }`)

    const { stderr } = await runNextCommand(['build', appDir], {
      stderr: true,
      env: {
        NEXT_TELEMETRY_DEBUG: 1,
      },
    })

    await fs.remove(nextConfig)
    await fs.remove(path.join(appDir, 'dist'))

    expect(stderr).toMatch(/hasDistDir.*?true/)
  })

  it('detects valid page extensions for `next build`', async () => {
    await fs.writeFile(
      nextConfig,
      `module.exports = {
        pageExtensions: ['tsx', 'ts', 'jsx', 'js', 'mdx', 'mdx', 'md', 'verylongextension', '', 123, null]
      }`
    )

    const { stderr } = await runNextCommand(['build', appDir], {
      stderr: true,
      env: {
        NEXT_TELEMETRY_DEBUG: 1,
      },
    })

    await fs.remove(nextConfig)

    expect(stderr).toMatch(/pageExtensions.*?\[\s*"mdx",\s*"md"\s*]/)
  })

  it('detects unused configs for `next export`', async () => {
    await runNextCommand(['build', appDir], {
      env: {
        NEXT_TELEMETRY_DEBUG: 1,
      },
    })

    const { stderr } = await runNextCommand(['export', appDir], {
      stderr: true,
      env: {
        NEXT_TELEMETRY_DEBUG: 1,
      },
    })

    expect(stderr).toMatch(/target.*?null/)
    expect(stderr).toMatch(/hasAssetPrefix.*?false/)
    expect(stderr).toMatch(/hasDistDir.*?false/)
    expect(stderr).toMatch(/hasRuntimeConfig.*?false/)
    expect(stderr).toMatch(/hasTrailingSlash.*?false/)
    expect(stderr).toMatch(/hasExportPathMap.*?false/)
  })

  it('detects custom configs in next.config.js for `next export`', async () => {
    await fs.writeFile(
      nextConfig,
      `
        module.exports = {
          target: 'server',
          distDir: 'dist',
          assetPrefix: 'prefix',
          publicRuntimeConfig: { key: 'value' },
          exportTrailingSlash: true,
          exportPathMap: defaultMap => defaultMap
        }
      `
    )
    await runNextCommand(['build', appDir], {
      env: {
        NEXT_TELEMETRY_DEBUG: 1,
      },
    })

    const { stderr } = await runNextCommand(['export', appDir], {
      stderr: true,
      env: {
        NEXT_TELEMETRY_DEBUG: 1,
      },
    })

    await fs.remove(nextConfig)
    await fs.remove(path.join(appDir, 'dist'))

    expect(stderr).toMatch(/target.*?server/)
    expect(stderr).toMatch(/hasAssetPrefix.*?true/)
    expect(stderr).toMatch(/hasDistDir.*?true/)
    expect(stderr).toMatch(/hasRuntimeConfig.*?true/)
    expect(stderr).toMatch(/hasTrailingSlash.*?true/)
    expect(stderr).toMatch(/hasExportPathMap.*?true/)
  })
})
