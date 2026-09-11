const { spawn } = require('node:child_process')
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const packageRunner = JSON.parse(
  fs.readFileSync('/tmp/next-upgrade-tools/versions.json', 'utf8')
).packageRunner
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function checkApp(directory, major, mode = 'dev') {
  const port = await new Promise((resolve) => {
    const server = http.createServer()
    server.listen(0, '127.0.0.1', () => {
      const value = server.address().port
      server.close(() => resolve(value))
    })
  })
  const log = fs.openSync(path.join(directory, '.upgrade-runtime.log'), 'a')
  // Exercise the app's own script, including its bundler flags.
  if (mode === 'start') {
    fs.rmSync(path.join(directory, '.next'), { recursive: true, force: true })
    await new Promise((resolve, reject) => {
      const build = spawn(packageRunner, ['build'], {
        cwd: directory,
        env: {
          ...process.env,
          NEXT_TELEMETRY_DISABLED: '1',
        },
        stdio: ['ignore', log, log],
      })
      const timer = setTimeout(() => {
        build.kill('SIGTERM')
        reject(new Error('Build timed out'))
      }, 180000)
      build.once('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
      build.once('exit', (code) => {
        clearTimeout(timer)
        code === 0 ? resolve() : reject(new Error(`Build exited ${code}`))
      })
    }).catch(async (error) => {
      fs.closeSync(log)
      throw error
    })
  }
  const child = spawn(packageRunner, [mode, '--port', String(port)], {
    cwd: directory,
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: '1',
    },
    stdio: ['ignore', log, log],
    detached: true,
  })
  let launchError
  child.once('error', (error) => {
    launchError = error
  })
  const request = async (route, viewer) => {
    const response = await fetch(`http://127.0.0.1:${port}${route}`, {
      headers: viewer ? { cookie: `viewer=${viewer}` } : {},
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) throw new Error(`HTTP ${response.status} on ${route}`)
    return response.text()
  }
  try {
    let ready = false
    for (let attempt = 0; attempt < 120; attempt++) {
      if (launchError) throw launchError
      if (child.exitCode !== null)
        throw new Error('App exited before becoming ready')
      try {
        await request('/api/health')
        ready = true
        break
      } catch {
        await delay(500)
      }
    }
    if (!ready) throw new Error('App did not become ready')
    if (!major) {
      const html = await request('/')
      if (!html.includes('Security upgrade fixture'))
        throw new Error('Pages behavior changed')
      return { pages: true }
    }
    const alice = await request('/', 'alice')
    const bob = await request('/', 'bob')
    if (!alice.includes('Viewer: alice') || !bob.includes('Viewer: bob'))
      throw new Error('Async request helper/caller behavior is not repaired')
    const preview = await fetch(
      `http://127.0.0.1:${port}/_next/image?url=%2Fpixel.png&w=64&q=60`,
      { signal: AbortSignal.timeout(10000) }
    )
    if (
      !preview.ok ||
      !preview.headers.get('content-type')?.startsWith('image/')
    ) {
      throw new Error(`Image quality contract changed: HTTP ${preview.status}`)
    }
    if (!(await preview.arrayBuffer()).byteLength)
      throw new Error('Image quality contract returned an empty preview')
    return { requestIsolation: true, imageQuality: 60 }
  } finally {
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch {}
    fs.closeSync(log)
  }
}
module.exports = { checkApp }
if (require.main === module)
  checkApp(process.cwd(), process.argv.includes('--major')).then(
    (result) => console.log(JSON.stringify(result)),
    (error) => {
      console.error(error)
      process.exitCode = 1
    }
  )
