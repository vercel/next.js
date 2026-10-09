// The normal build retains its output lock in this process until the production
// server closes. The server runs in a fresh child, without build-time globals.
const { fork } = require('node:child_process')
const { createHash } = require('node:crypto')
const { readFile, realpath } = require('node:fs/promises')
const { createRequire } = require('node:module')
const { join, resolve } = require('node:path')

let started = false
let stopping = false
let server
process.on('message', async (message) => {
  if (!message || typeof message !== 'object') return
  if (message.type === 'cancel') {
    stopping = true
    if (server?.connected) server.send({ type: 'cancel' })
    else process.kill(process.pid, 'SIGTERM')
    return
  }
  if (message.type !== 'run' || started) return
  started = true
  try {
    const input = message.input
    if (
      !input ||
      typeof input.projectDir !== 'string' ||
      typeof input.distDir !== 'string'
    ) {
      throw new Error('Invalid Next production application-build input')
    }
    const requireFromProject = createRequire(
      join(input.projectDir, 'package.json')
    )
    const serverEnv = { ...process.env, NODE_ENV: 'production' }
    delete serverEnv.NEXT_PHASE
    delete serverEnv.__NEXT_DEV_SERVER
    const { nextBuild } = requireFromProject('next/dist/cli/next-build')
    await nextBuild(
      {
        turbopack: true,
        mangling: true,
        experimentalDebugMemoryUsage: false,
        experimentalBuildMode: 'default',
      },
      input.projectDir
    )
    if (stopping) return
    const distDir = await realpath(resolve(input.projectDir, input.distDir))
    const files = [
      'BUILD_ID',
      'required-server-files.json',
      'routes-manifest.json',
      'prerender-manifest.json',
    ]
    const contents = await Promise.all(
      files.map((file) => readFile(join(distDir, file)))
    )
    const buildId = contents[0].toString().trim()
    const { config } = JSON.parse(contents[1].toString())
    if (
      !buildId ||
      (await realpath(resolve(input.projectDir, config.distDir))) !== distDir ||
      config.experimental?.lockDistDir !== true ||
      config.output === 'export'
    ) {
      throw new Error(
        'Production application build does not satisfy its server lease'
      )
    }
    process.send?.({
      nextApplicationBuild: true,
      buildId,
      testingApiEnabled:
        config.experimental?.exposeTestingApiInProductionBuild === true,
      manifests: Object.fromEntries(
        files.map((file, index) => [
          file,
          createHash('sha256').update(contents[index]).digest('hex'),
        ])
      ),
    })
    server = fork(require.resolve('./server-worker'), [], {
      cwd: input.projectDir,
      env: serverEnv,
      execArgv: ['--enable-source-maps'],
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    })
    server.on('message', async (event) => {
      try {
        if (event?.nextServerReady === true) {
          if (typeof event.distDir !== 'string')
            throw new Error('Production server omitted its output directory')
          const servedDir = await realpath(
            resolve(input.projectDir, event.distDir)
          )
          const servedBuildId = (
            await readFile(join(servedDir, 'BUILD_ID'), 'utf8')
          ).trim()
          if (servedDir !== distDir || servedBuildId !== buildId) {
            throw new Error(
              'Production server output does not match the locked application build'
            )
          }
          process.send?.({ ...event, buildId })
        } else {
          process.send?.(event)
        }
      } catch (error) {
        console.error(error)
        process.exit(1)
      }
    })
    server.on('error', (error) => {
      console.error(error)
      process.exit(1)
    })
    server.on('exit', (code, signal) => {
      // Preserve unexpected failures, even if cancellation was requested.
      process.exit(code ?? (stopping && signal === 'SIGTERM' ? 143 : 1))
    })
    server.send({
      type: 'run',
      input: { projectDir: input.projectDir, mode: 'production' },
    })
  } catch (error) {
    console.error(error)
    process.exit(1)
  }
})
