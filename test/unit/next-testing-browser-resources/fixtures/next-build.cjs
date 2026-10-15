// Protocol fixture only; real application compilation is a separate e2e gate.
const { mkdir, readFile, writeFile } = require('node:fs/promises')
const { join } = require('node:path')
exports.nextBuild = async (options, dir, testing) => {
  if (process.env.NODE_ENV !== 'production' || process.env.__NEXT_DEV_SERVER) {
    throw new Error('Incorrect production build environment')
  }
  if (
    !options.turbopack ||
    !options.mangling ||
    options.experimentalBuildMode !== 'default'
  ) {
    throw new Error('Incorrect production build options')
  }
  process.env.NEXT_PHASE = 'phase-production-build'
  await writeFile(join(dir, 'build.pid'), String(process.pid))
  const scenario = await readFile(join(dir, 'scenario'), 'utf8')
  if (scenario === 'build-failure') throw new Error('Expected build failure')
  if (scenario === 'build-hang') return new Promise(() => {})
  const dist = join(dir, '.next')
  await mkdir(dist, { recursive: true })
  await writeFile(join(dist, 'BUILD_ID'), 'protocol-build')
  await writeFile(
    join(dist, 'required-server-files.json'),
    JSON.stringify({
      config: {
        distDir: '.next',
        experimental: {
          lockDistDir: true,
          exposeTestingApiInProductionBuild: scenario === 'instrumented',
        },
      },
    })
  )
  await writeFile(join(dist, 'routes-manifest.json'), '{}')
  await writeFile(join(dist, 'prerender-manifest.json'), '{}')
  if (testing?.browserFixtureHost) {
    const host = testing.browserFixtureHost
    await writeFile(
      join(dir, 'compiled-fixture-registration.json'),
      JSON.stringify(host)
    )
    const appPaths = {},
      appRoutes = {}
    for (const fixture of host.fixtures) {
      const pathname = `${host.routePrefix}/${fixture.id}`,
        page = `${pathname}/page`
      appPaths[page] =
        scenario === 'fixture-wrong-route'
          ? 'app/wrong/page.js'
          : `app${page}.js`
      appRoutes[page] = pathname
      await mkdir(join(dist, 'server/app', pathname), { recursive: true })
      if (scenario !== 'fixture-missing-manifest') {
        await writeFile(
          join(dist, `server/app${page}_client-reference-manifest.js`),
          '// protocol client manifest'
        )
        await writeFile(
          join(dist, `server/app${page}.js.nft.json`),
          JSON.stringify({ version: 1, files: ['../protocol.js'] })
        )
      }
    }
    await writeFile(
      join(dist, 'server/app-paths-manifest.json'),
      JSON.stringify(appPaths)
    )
    await writeFile(
      join(dist, 'app-path-routes-manifest.json'),
      JSON.stringify(appRoutes)
    )
  }
}
