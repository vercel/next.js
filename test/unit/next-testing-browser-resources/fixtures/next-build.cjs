// Protocol fixture only; real application compilation is a separate e2e gate.
const { mkdir, readFile, writeFile } = require('node:fs/promises')
const { join } = require('node:path')
exports.nextBuild = async (options, dir) => {
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
}
