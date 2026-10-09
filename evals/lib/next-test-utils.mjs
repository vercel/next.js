import { execFile, spawn } from 'node:child_process'
import { closeSync, openSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { setTimeout } from 'node:timers/promises'
import { promisify } from 'node:util'

function nextBin() {
  return createRequire(join(process.cwd(), 'package.json')).resolve(
    'next/dist/bin/next'
  )
}

function nextEnv(mode) {
  return {
    ...process.env,
    NODE_ENV: mode === 'dev' ? 'development' : 'production',
    NEXT_TELEMETRY_DISABLED: '1',
  }
}

export async function buildNextApp() {
  await promisify(execFile)(process.execPath, [nextBin(), 'build'], {
    env: nextEnv('build'),
    timeout: 180_000,
    killSignal: 'SIGKILL',
    maxBuffer: 10 * 1024 * 1024,
  })
}

export async function startNextServer({
  mode = 'start',
  port = 0,
  detached = false,
  logFile = undefined,
} = {}) {
  if (detached && (!port || !logFile)) {
    throw new Error('Detached servers require a port and log file')
  }

  const log = logFile ? openSync(logFile, 'a') : undefined
  const server = spawn(
    process.execPath,
    [nextBin(), mode, '--hostname', '127.0.0.1', '--port', String(port)],
    {
      env: nextEnv(mode),
      detached,
      stdio:
        log === undefined ? ['ignore', 'pipe', 'pipe'] : ['ignore', log, log],
    }
  )
  if (log !== undefined) closeSync(log)

  let output = ''
  server.stdout?.on('data', (chunk) => {
    output += chunk
  })
  server.stderr?.on('data', (chunk) => {
    output += chunk
  })
  let startupError
  const stopped = new Promise((resolve) => {
    server.once('exit', () => resolve())
    server.once('error', (error) => {
      startupError = error
      resolve()
    })
  })

  async function stop() {
    if (server.pid && server.exitCode === null && server.signalCode === null) {
      if (detached) process.kill(-server.pid, 'SIGKILL')
      else server.kill('SIGKILL')
    }
    await stopped
  }

  try {
    const deadline = Date.now() + 30_000
    while (Date.now() < deadline) {
      if (startupError) throw startupError
      if (server.exitCode !== null || server.signalCode !== null) break
      const url = port
        ? `http://127.0.0.1:${port}`
        : output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0]
      if (url) {
        try {
          const response = await fetch(url, {
            signal: AbortSignal.timeout(2_000),
          })
          await response.arrayBuffer()
          if (response.ok) {
            if (detached) server.unref()
            return { url, stop }
          }
        } catch {}
      }
      await setTimeout(100)
    }
    const logs = logFile ? readFileSync(logFile, 'utf8') : output
    throw new Error(`Next.js ${mode} failed to become ready:\n${logs}`)
  } catch (error) {
    await stop()
    throw error
  }
}
