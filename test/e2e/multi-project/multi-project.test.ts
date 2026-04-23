import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import { findPort, fetchViaHTTP, killApp } from 'next-test-utils'
import stripAnsi from 'strip-ansi'
import { parseProjectGroups } from '../../../packages/next/src/lib/multi-project'

const fixturesDir = path.join(__dirname, 'fixtures')
const nextDir = path.dirname(require.resolve('next/package'))
const nextBin = path.join(nextDir, 'dist/bin/next')

/** Check whether the native bindings support the daemon (they must be locally
 *  compiled from this branch — pre-built npm binaries won't have the new API). */
function hasDaemonSupport(): boolean {
  try {
    const bindings = require('next/dist/build/swc')
    return typeof bindings.turbo?.startTurbopackDaemon === 'function'
  } catch {
    return false
  }
}

const describeDaemon = hasDaemonSupport() ? describe : describe.skip

describeDaemon('multi-project dev server', () => {
  let devProcess: ChildProcess
  let port1: number
  let port2: number
  let output = ''

  beforeAll(async () => {
    port1 = await findPort()
    port2 = await findPort()

    devProcess = spawn(
      process.execPath,
      [
        '--no-deprecation',
        nextBin,
        'dev',
        '--experimental-project',
        path.join(fixturesDir, 'proj1'),
        '--port',
        String(port1),
        '--experimental-project',
        path.join(fixturesDir, 'proj2'),
        '--port',
        String(port2),
      ],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          NODE_ENV: undefined,
          __NEXT_TEST_MODE: 'true',
          NEXT_TELEMETRY_DISABLED: '1',
        },
      }
    )

    // Wait for both workers to print "Ready in"
    await new Promise<void>((resolve, reject) => {
      let readyCount = 0
      let settled = false

      const settle = (fn: () => void) => {
        if (!settled) {
          settled = true
          clearTimeout(timer)
          fn()
        }
      }

      devProcess.stdout!.on('data', (chunk: Buffer) => {
        const msg = chunk.toString()
        output += msg
        process.stdout.write(chunk)

        const stripped = stripAnsi(msg)
        const matches = stripped.match(/✓ Ready in/gi) ?? []
        readyCount += matches.length
        if (readyCount >= 2) {
          settle(resolve)
        }
      })

      devProcess.stderr!.on('data', (chunk: Buffer) => {
        output += chunk.toString()
        process.stderr.write(chunk)
      })

      devProcess.on('error', (err) => settle(() => reject(err)))
      devProcess.on('close', (code) => {
        settle(() =>
          reject(
            new Error(
              `next dev exited with code ${code} before both projects were ready.\nOutput:\n${output}`
            )
          )
        )
      })

      const timer = setTimeout(() => {
        settle(() =>
          reject(
            new Error(
              `Timed out waiting for both projects to be ready (readyCount=${readyCount}).\nOutput:\n${output}`
            )
          )
        )
      }, 120_000)
      timer.unref()
    })
  }, 180_000)

  afterAll(async () => {
    await killApp(devProcess)
  })

  it('serves project 1 on its port', async () => {
    const res = await fetchViaHTTP(port1, '/')
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('Project 1')
    expect(html).not.toContain('Project 2')
  })

  it('serves project 2 on its port', async () => {
    const res = await fetchViaHTTP(port2, '/')
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('Project 2')
    expect(html).not.toContain('Project 1')
  })

  it('both workers started', () => {
    const stripped = stripAnsi(output)
    const matches = stripped.match(/✓ Ready in/gi) ?? []
    expect(matches.length).toBeGreaterThanOrEqual(2)
  })
})

describe('parseProjectGroups', () => {
  /** Shorthand that prepends the standard ['node', 'next', 'dev'] prefix. */
  const parse = (...args: string[]) =>
    parseProjectGroups(['node', 'next', 'dev', ...args])

  it('returns empty array for no --experimental-project flags', () => {
    expect(parse()).toEqual([])
  })

  it('returns single project', () => {
    expect(parse('--experimental-project', './app')).toEqual([{ dir: './app' }])
  })

  it('parses two projects with ports', () => {
    expect(
      parse(
        '--experimental-project',
        './p1',
        '--port',
        '3000',
        '--experimental-project',
        './p2',
        '--port',
        '3001'
      )
    ).toEqual([
      { dir: './p1', port: 3000 },
      { dir: './p2', port: 3001 },
    ])
  })

  it('parses per-project bundler flags', () => {
    expect(
      parse(
        '--experimental-project',
        './p1',
        '--turbopack',
        '--experimental-project',
        './p2',
        '--webpack'
      )
    ).toEqual([
      { dir: './p1', turbopack: true },
      { dir: './p2', webpack: true },
    ])
  })

  it('handles -p shorthand for port', () => {
    expect(parse('--experimental-project', './p1', '-p', '4000')).toEqual([
      { dir: './p1', port: 4000 },
    ])
  })

  it('handles --turbo alias for --turbopack', () => {
    expect(parse('--experimental-project', './p1', '--turbo')).toEqual([
      { dir: './p1', turbopack: true },
    ])
  })

  it('throws when --experimental-project has no value', () => {
    expect(() => parse('--experimental-project')).toThrow(
      '--experimental-project requires a directory argument'
    )
  })

  it('throws when --experimental-project value looks like a flag', () => {
    expect(() => parse('--experimental-project', '--port', '3000')).toThrow(
      '--experimental-project requires a directory argument'
    )
  })

  it('throws when --port has no value', () => {
    expect(() => parse('--experimental-project', './p1', '--port')).toThrow(
      '--port requires a valid port number'
    )
  })

  it('throws when --port is not a number', () => {
    expect(() =>
      parse('--experimental-project', './p1', '--port', 'abc')
    ).toThrow('--port requires a valid port number')
  })

  it('throws when --port is out of range', () => {
    expect(() =>
      parse('--experimental-project', './p1', '--port', '99999')
    ).toThrow('--port requires a valid port number')
  })

  it('ignores flags before the first --experimental-project', () => {
    expect(parse('--turbopack', '--experimental-project', './p1')).toEqual([
      { dir: './p1' },
    ])
  })

  it('parses --port=3000 equals form', () => {
    expect(
      parse(
        '--experimental-project',
        './p1',
        '--port=3000',
        '--experimental-project',
        './p2',
        '--port=4000'
      )
    ).toEqual([
      { dir: './p1', port: 3000 },
      { dir: './p2', port: 4000 },
    ])
  })

  it('throws when --port value is another flag', () => {
    expect(() =>
      parse(
        '--experimental-project',
        './p1',
        '--port',
        '--experimental-project',
        './p2'
      )
    ).toThrow('--port requires a valid port number')
  })

  it('returns a single project group with port', () => {
    expect(parse('--experimental-project', './app', '--port', '3000')).toEqual([
      { dir: './app', port: 3000 },
    ])
  })

  it('accepts port 0 (ephemeral)', () => {
    expect(parse('--experimental-project', './p1', '--port', '0')).toEqual([
      { dir: './p1', port: 0 },
    ])
  })

  it('throws when --port is negative', () => {
    expect(() =>
      parse('--experimental-project', './p1', '--port', '-1')
    ).toThrow('--port requires a valid port number')
  })
})
