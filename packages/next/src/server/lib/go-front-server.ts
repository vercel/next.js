import { spawn } from 'child_process'
import { randomBytes } from 'crypto'
import { promises as fs } from 'fs'
import { isAbsolute, join, relative } from 'path'
import { startServer, type StartServerOptions } from './start-server'
import { formatHostname } from './format-hostname'
import { logStartInfo } from './app-info-log'
import * as Log from '../../build/output/log'
import { INTERNAL_HEADERS } from './server-ipc/utils'

/** Launch the shipped frontend; it loads application plugins and Node remains private. */
export async function startGoFrontServer(options: StartServerOptions) {
  const config = options.preloadedConfig!.config
  const serverDir = join(options.dir, config.distDir, 'server')
  const descriptor = JSON.parse(
    await fs.readFile(join(serverDir, 'go-server.json'), 'utf8')
  )
  const goos = process.platform === 'win32' ? 'windows' : process.platform
  const goarch =
    process.arch === 'x64'
      ? 'amd64'
      : process.arch === 'ia32'
        ? '386'
        : process.arch
  if (
    descriptor.version !== 3 ||
    descriptor.goos !== goos ||
    descriptor.goarch !== goarch ||
    typeof descriptor.frontend !== 'string' ||
    !Array.isArray(descriptor.plugins) ||
    !['linux', 'darwin'].includes(goos)
  ) {
    throw new Error(
      'Invalid Go server output or incompatible OS/architecture; rebuild on this host'
    )
  }
  const executable = join(serverDir, descriptor.frontend)
  const localPath = relative(serverDir, executable)
  if (localPath.startsWith('..') || isAbsolute(localPath))
    throw new Error('Go server executable is outside the server output')
  const executableStat = await fs.lstat(executable)
  if (!executableStat.isFile() || !(executableStat.mode & 0o111)) {
    throw new Error('Go frontend must be a regular executable file')
  }
  const token = randomBytes(32).toString('hex')
  const frontend: NonNullable<StartServerOptions['goFrontend']> = {
    token,
    publicPort: options.port,
    publicHostname: options.hostname,
  }
  const backend = await startServer({
    ...options,
    hostname: '127.0.0.1',
    port: 0,
    goFrontend: frontend,
  })
  const child = spawn(executable, [], {
    cwd: options.dir,
    stdio: ['pipe', 'pipe', 'inherit'],
    windowsHide: true,
    env: {
      ...process.env,
      __NEXT_GO_UPSTREAM: `http://127.0.0.1:${backend.port}`,
    },
  })
  const launch =
    JSON.stringify({
      manifest: join(serverDir, 'go-server.json'),
      listen: `${options.hostname ? formatHostname(options.hostname) : ''}:${options.port}`,
      nodePort: backend.port,
      token,
      internalHeaders: INTERNAL_HEADERS,
      trustedProxies: (process.env.NEXT_GO_TRUSTED_PROXIES || '')
        .split(',')
        .filter(Boolean),
    }) + '\n'
  let closing = false
  const exited = new Promise<void>((resolve) =>
    child.once('close', () => resolve())
  )
  frontend.close = async () => {
    closing = true
    child.stdin?.end()
    const timer = setTimeout(() => child.kill('SIGKILL'), 21_000)
    timer.unref()
    await exited
    clearTimeout(timer)
  }
  child.once('exit', (code, signal) => {
    if (!closing) {
      console.error(`Go frontend exited unexpectedly (${signal || code})`)
      process.kill(process.pid, 'SIGTERM')
    }
  })
  try {
    const publicPort = await new Promise<number>((resolve, reject) => {
      let settled = false
      const marker = Buffer.from(`\x1eNEXT_GO_READY:${token}:`)
      let pending = Buffer.alloc(0)
      const timeout = setTimeout(
        () =>
          finish(
            new Error('Go frontend did not become ready within 20 seconds')
          ),
        20_000
      )
      const onExit = () =>
        finish(new Error('Go frontend exited before readiness'))
      const finish = (error?: Error, port?: number) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        child.off('error', finish)
        child.off('exit', onExit)
        child.stdout!.removeAllListeners('data')
        if (error) reject(error)
        else {
          child.stdout!.pipe(process.stdout, { end: false })
          resolve(port!)
        }
      }
      child.once('error', finish)
      child.once('exit', onExit)
      // Keep an error listener after readiness too: a failed child may close its
      // control pipe before Node observes exit, emitting EPIPE asynchronously.
      child.stdin!.on('error', finish)
      child.stdout!.on('data', (chunk: Buffer) => {
        pending = Buffer.concat([pending, chunk])
        const index = pending.indexOf(marker)
        if (index < 0) {
          const count = Math.max(0, pending.length - marker.length + 1)
          process.stdout.write(pending.subarray(0, count))
          pending = pending.subarray(count)
          return
        }
        process.stdout.write(pending.subarray(0, index))
        pending = pending.subarray(index)
        const end = pending.indexOf(10, marker.length)
        if (end < 0) {
          if (pending.length > marker.length + 6)
            finish(new Error('Invalid Go frontend readiness message'))
          return
        }
        const port = Number(pending.subarray(marker.length, end).toString())
        if (!Number.isInteger(port) || port <= 0 || port > 65535) {
          finish(new Error('Invalid Go frontend port'))
          return
        }
        process.stdout.write(pending.subarray(end + 1))
        finish(undefined, port)
      })
      child.stdin!.write(launch)
    })
    const origin = `http://${formatHostname(options.hostname || 'localhost')}:${publicPort}`
    process.env.PORT = String(publicPort)
    process.env.__NEXT_PRIVATE_ORIGIN = origin
    logStartInfo({ networkUrl: null, appUrl: origin, logBundler: false })
    console.log(`Go frontend ready at ${origin}`)
    Log.event(
      `Ready in ${Date.now() - Number(process.env.NEXT_PRIVATE_START_TIME || Date.now())}ms`
    )
    return { distDir: backend.distDir, port: publicPort }
  } catch (error) {
    console.error(error)
    await frontend.close()
    process.kill(process.pid, 'SIGTERM')
    throw error
  }
}
