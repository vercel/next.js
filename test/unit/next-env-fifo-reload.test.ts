import { execFileSync, spawn, type ChildProcess } from 'child_process'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { loadEnvConfig } from '../../packages/next-env/'

const silent = { info() {}, error() {} }

describe('loadEnvConfig with a FIFO-mounted .env', () => {
  let dir: string
  let writer: ChildProcess | undefined

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'next-env-fifo-'))
    delete process.env.SECRET
  })

  afterEach(() => {
    writer?.kill()
    writer = undefined
    delete process.env.SECRET
    rmSync(dir, { recursive: true, force: true })
  })

  it('keeps the previously-loaded env when a forced reload reads nothing', () => {
    // FIFOs are POSIX-only.
    if (process.platform === 'win32') return

    const fifo = path.join(dir, '.env')
    execFileSync('mkfifo', [fifo])
    // Serve the secret once, then empty on later opens, as a drained pipe does.
    // Each redirect blocks until a reader opens the pipe, so it self-synchronises.
    writer = spawn('sh', [
      '-c',
      `printf 'SECRET=from-secret-manager\\n' > "${fifo}"; : > "${fifo}"`,
    ])

    loadEnvConfig(dir, true, silent)
    expect(process.env.SECRET).toBe('from-secret-manager')

    loadEnvConfig(dir, true, silent, true)
    expect(process.env.SECRET).toBe('from-secret-manager')
  }, 20000)
})
