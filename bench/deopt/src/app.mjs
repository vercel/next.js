import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import {
  getFreePort,
  hashDir,
  nextBin,
  nextDistFingerprint,
  repoRoot,
  waitFor,
} from './util.mjs'

const BUILD_HASH_FILE = 'BENCH_DEOPT_BUILD_HASH'

function nextVersion() {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(repoRoot(), 'packages/next/package.json'), 'utf8')
  )
  return pkg.version
}

/**
 * `next build` the fixture app, skipped when neither the fixture sources,
 * the next version, nor the built next package (dist fingerprint) changed
 * since the last build — so editing packages/next and rebuilding correctly
 * invalidates the fixture.
 */
export async function buildApp(
  appDir,
  { force = false, log = console.error } = {}
) {
  const hash = `${nextVersion()}:${nextDistFingerprint()}:${hashDir(appDir)}`
  const hashFile = path.join(appDir, '.next', BUILD_HASH_FILE)
  if (
    !force &&
    fs.existsSync(hashFile) &&
    fs.readFileSync(hashFile, 'utf8') === hash
  ) {
    log(
      `[bench-deopt] build cache hit for ${path.basename(appDir)}, skipping next build`
    )
    return
  }
  log(`[bench-deopt] building fixture ${appDir}`)
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [nextBin(), 'build'], {
      cwd: appDir,
      stdio: ['ignore', 'inherit', 'inherit'],
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    })
    child.on('error', reject)
    child.on('exit', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`next build exited with code ${code}`))
    )
  })
  fs.writeFileSync(hashFile, hash)
}

/**
 * `next start` the fixture in a child process (deliberately NOT V8-logged;
 * only the browser is under measurement) and wait until it serves requests.
 */
export async function startApp(appDir, { log = console.error } = {}) {
  const port = await getFreePort()
  const url = `http://localhost:${port}`
  log(`[bench-deopt] starting fixture server at ${url}`)
  const child = spawn(
    process.execPath,
    [nextBin(), 'start', '--port', String(port)],
    {
      cwd: appDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    }
  )
  let output = ''
  child.stdout.on('data', (chunk) => (output += chunk))
  child.stderr.on('data', (chunk) => (output += chunk))
  let exited = false
  child.on('exit', () => (exited = true))

  const stop = () =>
    new Promise((resolve) => {
      if (exited) return resolve()
      child.on('exit', () => resolve())
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), 5_000).unref()
    })

  try {
    await waitFor(
      async () => {
        if (exited) {
          throw new Error(`next start exited early. Output:\n${output}`)
        }
        const res = await fetch(url, { redirect: 'manual' })
        return res.status < 500
      },
      { timeoutMs: 60_000, description: `fixture server at ${url}` }
    )
  } catch (err) {
    await stop()
    throw err
  }
  return { url, port, stop }
}
