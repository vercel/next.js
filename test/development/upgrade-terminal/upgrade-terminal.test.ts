import { nextTestSetup } from 'e2e-utils'
import { findPort, killProcess, retry } from 'next-test-utils'
import { join } from 'node:path'
import { access, readFile, rm, writeFile } from 'node:fs/promises'
import resolveFrom from 'resolve-from'

// Real dev server, compiler, and menu. Only the offer and upgrade command are simulated.
describe('upgrade terminal during dev', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    dependencies: { 'node-pty': '0.10.1' },
    packageJson: { pnpm: { onlyBuiltDependencies: ['node-pty'] } },
  })
  let terminal: { pid: number; write(data: string): void } | null = null
  let exitCode: number | null = null
  let output = ''
  let port: number

  async function start() {
    port = await findPort()
    output = ''
    exitCode = null
    for (const file of [
      'emit-logs',
      'logs-done',
      'build-progress',
      'build-worker-pid',
      'release-build',
    ]) {
      await rm(join(next.testDir, file), { force: true })
    }
    const pty = require(resolveFrom(next.testDir, 'node-pty'))
    const session = pty.spawn(
      process.execPath,
      [
        './fixtures/driver.cjs',
        '--hostname',
        '127.0.0.1',
        '--port',
        String(port),
        isTurbopack ? '--turbopack' : '--webpack',
      ],
      {
        name: 'xterm-color',
        cols: 80,
        rows: 24,
        cwd: next.testDir,
        env: {
          ...process.env,
          NODE_ENV: 'development',
          NEXT_TELEMETRY_DISABLED: '1',
          NEXT_EXIT_TIMEOUT_MS: '15000',
          UPGRADE_TEST_PORT: String(port),
        },
      }
    )
    terminal = session
    session.onData((data: string) => {
      output += data
    })
    session.onExit((event: { exitCode: number }) => {
      exitCode = event.exitCode
    })
    await retry(() => {
      expect(exitCode).toBe(null)
      expect(output).toContain('Upgrade now')
      expect(output).toContain('Skip until next version')
      expect(output).toContain('\x1b[?1049h')
    }, 30000)
  }

  async function request() {
    const response = await fetch(`http://127.0.0.1:${port}`, {
      signal: AbortSignal.timeout(30000),
    })
    expect(response.status).toBe(200)
    return response.text()
  }

  async function waitForExit() {
    await retry(() => {
      if (exitCode === null) {
        throw new Error(`CLI has not exited:\n${output}`)
      }
    }, 20000)
  }

  afterEach(async () => {
    if (terminal && exitCode === null) {
      await killProcess(terminal.pid, 'SIGKILL')
      await waitForExit()
    }
    terminal = null
  })

  it('serves and recompiles while output is held, then replays once on Skip', async () => {
    await start()
    // Requests and recompilation must finish while the prompt remains unanswered.
    const first = await request()
    expect(first).toContain('hello world')
    const pid = first.match(/data-pid="(\d+)"/)![1]
    const page = await readFile(join(next.testDir, 'pages/index.tsx'), 'utf8')
    try {
      await next.patchFile(
        'pages/index.tsx',
        page.replace('hello world', 'updated page')
      )
      await retry(async () => {
        expect(await request()).toContain('updated page')
      })
      await writeFile(join(next.testDir, 'emit-logs'), '')
      await retry(async () => {
        await access(join(next.testDir, 'logs-done'))
      })
      // Config and child-process logs must stay out of the prompt's output.
      const messages = [
        /CONFIG_BACKGROUND_LOG/g,
        /CONFIG_BACKGROUND_ERROR/g,
        /INHERITED_CHILD_LOG/g,
      ]
      for (const message of messages) {
        expect(output.match(message)).toBe(null)
      }
      expect(output.includes('\x1b[?1049l')).toBe(false)

      terminal!.write('\x1b[B\r') // Down, Enter selects Skip.
      await retry(() => {
        for (const message of messages) {
          expect(output.match(message)).toHaveLength(1)
        }
      })
      // Skip restores the main screen before replay and keeps the same server process.
      expect(output).toContain('\x1b[?1049l\x1b[?25h')
      for (const message of messages) {
        expect(output.search(message)).toBeGreaterThan(
          output.indexOf('\x1b[?1049l')
        )
      }
      expect((await request()).match(/data-pid="(\d+)"/)![1]).toBe(pid)
      // Navigation redraws the text, but must not open another alternate screen.
      const enterScreen = '\x1b[?1049h'
      expect(output.indexOf(enterScreen)).toBe(output.lastIndexOf(enterScreen))
      expect(output.includes('Upgrade prompt')).toBe(false)
    } finally {
      await next.patchFile('pages/index.tsx', page)
    }
  })

  it.each(['immediately', 'after serving a request'])(
    'stops accepting connections before upgrade handoff when selected %s',
    async (when) => {
      await start()
      if (when === 'after serving a request') {
        await request()
      }
      terminal!.write('\r') // Enter selects Upgrade now.
      await waitForExit()
      // The handoff marker is emitted only after checking that the port is closed.
      expect(output).toContain('UPGRADE_HANDOFF')
      expect(exitCode).toBe(0)
      expect(output).toContain('\x1b[?1049l\x1b[?25h')
    }
  )

  it('restores the terminal and exits without upgrading on Ctrl+C', async () => {
    await start()
    terminal!.write('\x03') // Send an actual Ctrl+C while the menu owns stdin.
    await waitForExit()
    expect(exitCode).toBe(130)
    expect(output).toContain('\x1b[?1049l\x1b[?25h')
    expect(output.includes('UPGRADE_HANDOFF')).toBe(false)
    await expect(
      fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(1000) })
    ).rejects.toThrow()
  })

  async function startBuild() {
    output = ''
    exitCode = null
    // Earlier dev cases leave generated validators that collide with build validators.
    await rm(join(next.testDir, '.next'), { recursive: true, force: true })
    for (const file of [
      'emit-logs',
      'logs-done',
      'build-progress',
      'release-build',
    ]) {
      await rm(join(next.testDir, file), { force: true })
    }
    const pty = require(resolveFrom(next.testDir, 'node-pty'))
    const session = pty.spawn(
      process.execPath,
      ['./fixtures/driver.cjs', isTurbopack ? '--turbopack' : '--webpack'],
      {
        name: 'xterm-color',
        cols: 80,
        rows: 24,
        cwd: next.testDir,
        env: {
          ...process.env,
          NODE_ENV: 'production',
          NEXT_TELEMETRY_DISABLED: '1',
          UPGRADE_TEST_COMMAND: 'build',
        },
      }
    )
    terminal = session
    session.onData((data: string) => {
      output += data
    })
    session.onExit((event: { exitCode: number }) => {
      exitCode = event.exitCode
    })
    await retry(() => {
      expect(exitCode).toBe(null)
      expect(output).toContain('Upgrade now')
    }, 30000)
  }

  async function waitForBuildProgress() {
    await writeFile(join(next.testDir, 'emit-logs'), '')
    await retry(async () => {
      if (exitCode !== null) {
        throw new Error(output.slice(-2000))
      }
      await access(join(next.testDir, 'logs-done'))
      await access(join(next.testDir, 'build-progress'))
    }, 30000)
    expect(exitCode).toBe(null)
    expect(output.includes('CONFIG_BACKGROUND_LOG')).toBe(false)
  }

  it('keeps a real build running while the menu owns the terminal', async () => {
    await startBuild()
    await waitForBuildProgress()
    terminal.write('\x1b[B\r') // Skip releases held build output.
    await writeFile(join(next.testDir, 'release-build'), '')
    await waitForExit()
    if (exitCode !== 0) {
      throw new Error(output)
    }
    expect(exitCode).toBe(0)
    expect(output).toContain('CONFIG_BACKGROUND_LOG')
    expect(output).toContain('Creating an optimized production build')
    expect(output.includes('UPGRADE_HANDOFF')).toBe(false)
  })

  it('stops a real build before upgrade handoff', async () => {
    await startBuild()
    try {
      await waitForBuildProgress()
      const buildWorkerPid = Number(
        await readFile(join(next.testDir, 'build-worker-pid'), 'utf8')
      )
      terminal!.write('\r') // Upgrade now stops the build at static generation.
      await waitForExit()
      if (exitCode !== 0) {
        throw new Error(output.slice(-2000))
      }
      expect(output).toContain('UPGRADE_HANDOFF')
      expect(output.indexOf('UPGRADE_HANDOFF')).toBeGreaterThan(
        output.indexOf('CONFIG_BACKGROUND_LOG')
      )
      await retry(() => {
        // Signal 0 only checks existence; a live build worker would race the upgrade.
        expect(() => process.kill(buildWorkerPid, 0)).toThrow()
      }, 5000)
    } finally {
      // Release a fixture worker even if the handoff assertion fails.
      await writeFile(join(next.testDir, 'release-build'), '')
    }
  })
})
