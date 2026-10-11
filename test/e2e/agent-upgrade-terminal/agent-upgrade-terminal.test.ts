// The lint rule does not know itOnPrerelease below runs a test.
/* eslint-disable jest/no-standalone-expect */
import { execFileSync } from 'child_process'
import path from 'path'
import fs from 'fs-extra'
import stripAnsi from 'strip-ansi'
import { nextTestSetup } from 'e2e-utils'
import { findPort, retry } from 'next-test-utils'

// The subset of node-pty used here; it is installed into the test app.
type IPty = {
  pid: number
  onData(listener: (data: string) => void): void
  onExit(listener: (event: { exitCode: number; signal?: number }) => void): void
  write(data: string): void
  kill(signal?: string): void
}

// The menu takes the alternate screen while it is open, so these sequences
// split output into before, behind, and after the menu.
const MENU_OPENED = '\x1b[?1049h'
const MENU_CLOSED = '\x1b[?1049l'

// Down selects Skip instead of the default Upgrade now; Return confirms it.
const SKIP = '\x1b[B\r'

// Choosing Upgrade relies on the security guard rejecting prerelease
// versions. On a stable version it would look up npm instead.
const itOnPrerelease = require('next/package.json').version.includes('-')
  ? it
  : it.skip

describe('agent upgrade terminal', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    // This test drives a local interactive CLI, which deployments cannot expose.
    skipDeployment: true,
    dependencies: {
      // The first release with Linux prebuilds, so CI does not compile it.
      'node-pty': '1.2.0-beta.15',
    },
    packageJson: {
      pnpm: {
        onlyBuiltDependencies: ['node-pty'],
      },
    },
  })

  if (skipped) {
    return
  }

  let terminal: IPty
  let output: string
  let exit: Promise<{ exitCode: number; signal?: number }>
  let exited: boolean
  let passed: boolean

  // Run the app's installed Next.js CLI in a PTY, so the test exercises real
  // TTY output and menu input with the same React instance as the app.
  // next.start() pipes stdio, so the menu would never show, and it waits for a
  // Ready line that the menu holds back.
  function launch(args: string[], envOverrides: NodeJS.Dict<string> = {}) {
    output = ''
    exited = false
    passed = false

    // Copy the runner's environment so test-only changes stay in this child.
    // next.env is what the harness passes to its own CLI runs, e.g.
    // NEXT_PRIVATE_LOCAL_DEV, which keeps this test file out of type checks.
    const env = { ...process.env, ...next.env }

    // node-pty passes TERM on as the terminal name; override an inherited
    // TERM=dumb so the menu stays available.
    env.TERM = 'xterm-256color'

    // Show a deterministic human menu even under an agent or CI.
    env.__NEXT_AGENT_UPGRADE_FORCE_TERMINAL_FOR_TESTING = '1'

    // Pin the upgrade to this locally built Next.js CLI. This skips npm's
    // canary lookup and reaches the security guard deterministically.
    env.__NEXT_UPGRADE_EXPECTED_CLI_VERSION =
      require('next/package.json').version

    // An undefined value removes the variable.
    for (const [key, value] of Object.entries(envOverrides)) {
      if (value === undefined) {
        delete env[key]
      } else {
        env[key] = value
      }
    }

    const { spawn } = require(
      require.resolve('node-pty', { paths: [next.testDir] })
    ) as {
      spawn(
        file: string,
        args: string[],
        options: {
          cwd: string
          env: NodeJS.ProcessEnv
          cols: number
          rows: number
        }
      ): IPty
    }
    terminal = spawn(
      process.execPath,
      [
        require.resolve('next/dist/bin/next', { paths: [next.testDir] }),
        ...args,
      ],
      {
        cwd: next.testDir,
        env,
        cols: 80,
        rows: 24,
      }
    )

    // Capture terminal output for assertions and its exit for teardown.
    terminal.onData((data) => {
      output += data
    })
    exit = new Promise((resolve) => {
      terminal.onExit((event) => {
        exited = true
        resolve(event)
      })
    })
  }

  // Wraps a test body so the terminal output is printed if it fails or times
  // out, and CI logs show what the CLI did.
  function inTerminal(fn: () => Promise<void>) {
    return async () => {
      await fn()
      passed = true
    }
  }

  // The last lines of output as plain text, without escape sequences.
  function plainOutput() {
    return stripAnsi(output)
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .slice(-200)
      .join('\n')
  }

  // Output before the menu, behind it, and after it closed, in that order.
  function splitAtMenu() {
    const opened = output.indexOf(MENU_OPENED)
    expect(opened).toBeGreaterThan(-1)
    const closed = output.indexOf(MENU_CLOSED, opened)
    expect(closed).toBeGreaterThan(-1)
    return [
      output.slice(0, opened),
      output.slice(opened, closed),
      output.slice(closed),
    ]
  }

  // Forget the previous test's CLI, so a setup failure does not print it.
  beforeEach(() => {
    terminal = undefined as any
  })

  afterEach(async () => {
    if (!terminal) {
      return
    }
    if (!passed) {
      console.log(
        `Terminal output (${exited ? JSON.stringify(await exit) : 'still running'}):\n${plainOutput()}`
      )
    }
    if (!exited) {
      terminal.kill('SIGTERM')
    }
    await exit
  })

  describe('dev', () => {
    if (!isNextDev) {
      return it.skip('only runs with Next.js dev', () => {})
    }

    let port: number

    beforeEach(async () => {
      port = await findPort()
      launch(['dev', '-p', String(port), '-H', '127.0.0.1'])

      // Start each test only after the menu is visible and ready for input.
      await retry(() => {
        expect(output).toContain('Upgrade now')
      }, 30_000)

      // The menu can appear before dev is ready; prove it is serving before
      // testing how each choice affects the running server.
      await retry(async () => {
        const response = await fetch(`http://127.0.0.1:${port}/`)
        expect(response.status).toBe(200)
        expect(await response.text()).toContain('hello world')
      }, 60_000)
    })

    it(
      'holds dev logs behind the menu and shows all of them after Skip',
      inTerminal(async () => {
        // The dev server shares the terminal's stdin with the menu.
        const tty = await fetch(`http://127.0.0.1:${port}/tty`)
        expect(await tty.json()).toEqual({ stdin: true })

        for (let n = 1; n <= 5; n++) {
          const response = await fetch(`http://127.0.0.1:${port}/log?n=${n}`)
          expect(response.status).toBe(200)
        }

        terminal.write(SKIP)
        await retry(() => {
          expect(output).toContain('UPGRADE_TERMINAL_LOG 5')
        }, 15_000)

        const [beforeMenu, menu, after] = splitAtMenu()
        // Config output precedes the menu, which takes the alternate screen.
        expect(beforeMenu).toContain('UPGRADE_TERMINAL_CONFIG_LOADED')
        expect(menu).not.toContain('UPGRADE_TERMINAL_CONFIG_LOADED')
        // Requests served while the menu was open log only after Skip.
        expect(menu).not.toContain('UPGRADE_TERMINAL_ROUTE_RENDERED')
        expect(menu).not.toContain('UPGRADE_TERMINAL_LOG')
        expect(after).toContain('UPGRADE_TERMINAL_ROUTE_RENDERED')
        expect(after.match(/UPGRADE_TERMINAL_LOG \d/g)).toEqual(
          [1, 2, 3, 4, 5].map((n) => `UPGRADE_TERMINAL_LOG ${n}`)
        )

        // Dev keeps serving, with output going straight to the terminal again.
        const response = await fetch(`http://127.0.0.1:${port}/log?n=6`)
        expect(response.status).toBe(200)
        await retry(() => {
          expect(output).toContain('UPGRADE_TERMINAL_LOG 6')
        }, 15_000)
        expect(exited).toBe(false)
      })
    )

    itOnPrerelease(
      'stops dev on Upgrade now without showing held output',
      inTerminal(async () => {
        const response = await fetch(`http://127.0.0.1:${port}/log?n=1`)
        expect(response.status).toBe(200)

        terminal.write('\r')
        // Security upgrades reject canary releases, so the upgrade CLI exits
        // with an error after the dev server shuts down.
        expect(await exit).toMatchObject({ exitCode: 1 })
        expect(output).toContain('Security advisories target stable versions')

        // Output from the stopped server is dropped, not shown before upgrading.
        expect(output).not.toContain('UPGRADE_TERMINAL_LOG')
        expect(output).not.toContain('UPGRADE_TERMINAL_ROUTE_RENDERED')
        await expect(fetch(`http://127.0.0.1:${port}/`)).rejects.toThrow()
      })
    )

    it(
      'stops dev when Ctrl+C is pressed in the menu',
      inTerminal(async () => {
        terminal.write('\x03')
        expect(await exit).toMatchObject({ exitCode: 130 })
        expect(splitAtMenu()[2]).toContain('UPGRADE_TERMINAL_ROUTE_RENDERED')
        await expect(fetch(`http://127.0.0.1:${port}/`)).rejects.toThrow()
      })
    )

    it(
      'closes the menu and shows all output when dev crashes',
      inTerminal(async () => {
        await fetch(`http://127.0.0.1:${port}/crash`).catch(() => {})
        expect(await exit).toMatchObject({ exitCode: 1 })

        // Compare lengths instead of the text to keep failures readable.
        const after = splitAtMenu()[2]
        const longestRun = Math.max(
          0,
          ...(after.match(/x{1024,}/g) ?? []).map((run) => run.length)
        )
        expect(longestRun).toBeGreaterThanOrEqual(200 * 1024)
        expect(after).toContain('UPGRADE_TERMINAL_CRASH_END')
      })
    )

    it(
      'keeps the menu working after dev restarts',
      inTerminal(async () => {
        const pid = await (await fetch(`http://127.0.0.1:${port}/pid`)).text()

        // Changing the config restarts dev while the menu is open.
        await next.patchFile(
          'next.config.js',
          (content) => `${content}\n// restart\n`,
          async () => {
            // A new pid means the old server process exited.
            await retry(async () => {
              const response = await fetch(`http://127.0.0.1:${port}/pid`)
              expect(await response.text()).not.toBe(pid)
            }, 60_000)
            const response = await fetch(`http://127.0.0.1:${port}/log?n=1`)
            expect(response.status).toBe(200)

            terminal.write(SKIP)
            await retry(() => {
              expect(splitAtMenu()[2]).toContain('UPGRADE_TERMINAL_LOG 1')
            }, 15_000)
          }
        )
        expect(exited).toBe(false)
      })
    )
  })

  if (!isNextDev) {
    describe('build', () => {
      // Full builds can take longer than the default test timeout.
      const BUILD_TIMEOUT = 180_000

      async function startBuild(
        args: string[] = [],
        envOverrides?: NodeJS.Dict<string>
      ) {
        // Keep a previous build's output from satisfying this build's checks.
        await fs.remove(path.join(next.testDir, '.next'))
        launch(['build', ...args], envOverrides)
        await retry(() => {
          expect(output).toContain('Upgrade now')
        }, 60_000)
      }

      // The build runs in a child of the CLI. Wait until it has written its
      // last artifacts and exited, while the menu is still open.
      async function waitForBuildBehindMenu() {
        await retry(() => {
          // Stop waiting if the CLI is gone; the check below reports it.
          if (exited) {
            return
          }
          expect(childPids(terminal.pid)).toEqual([])
        }, 150_000)
        expect(exited).toBe(false)
        // The marker is written near the end, so a failed build has none.
        expect(
          fs.existsSync(path.join(next.testDir, '.next/export-marker.json'))
        ).toBe(true)
      }

      function childPids(pid: number) {
        try {
          return execFileSync('pgrep', ['-P', String(pid)], {
            encoding: 'utf8',
          })
            .trim()
            .split('\n')
        } catch (error) {
          // pgrep exits with 1 when nothing matches.
          if ((error as { status?: number }).status === 1) {
            return []
          }
          throw error
        }
      }

      it(
        'shows build output after Skip',
        inTerminal(async () => {
          await startBuild()
          terminal.write(SKIP)
          expect(await exit).toMatchObject({ exitCode: 0 })

          const [beforeMenu, , after] = splitAtMenu()
          expect(beforeMenu).toContain('UPGRADE_TERMINAL_CONFIG_LOADED')
          expect(after).toContain('Compiled successfully')
          // Steps the spinner shows on a terminal print a line instead.
          expect(stripAnsi(after)).toMatch(
            /✓ Collecting page data using \d+ workers? in /
          )
          expect(stripAnsi(after)).toMatch(/✓ Finalizing page optimization in /)
        }),
        BUILD_TIMEOUT
      )

      it(
        'finishes the build behind the menu',
        inTerminal(async () => {
          await startBuild()
          await waitForBuildBehindMenu()
          expect(output).not.toContain('Compiled successfully')

          // The menu still answers after the build exited, and the CLI exits
          // right away.
          terminal.write(SKIP)
          await retry(() => expect(exited).toBe(true), 15_000)
          expect(await exit).toMatchObject({ exitCode: 0 })
          expect(splitAtMenu()[2]).toContain('Compiled successfully')
        }),
        BUILD_TIMEOUT
      )

      it(
        'reports a signal after the build finished as a failure',
        inTerminal(async () => {
          await startBuild()
          await waitForBuildBehindMenu()

          process.kill(terminal.pid, 'SIGTERM')
          await retry(() => expect(exited).toBe(true), 15_000)
          expect(await exit).toMatchObject({ exitCode: 143 })
          // The menu gave the normal screen back.
          splitAtMenu()
        }),
        BUILD_TIMEOUT
      )

      itOnPrerelease(
        'stops the build before starting the upgrade',
        inTerminal(async () => {
          await startBuild()
          terminal.write('\r')
          expect(await exit).toMatchObject({ exitCode: 1 })
          expect(output).toContain('Security advisories target stable versions')
          // Output from the stopped build is dropped.
          expect(splitAtMenu()[2]).not.toContain('Compiled successfully')
        })
      )

      it(
        'exits with 130 on Ctrl+C, without a NODE_ENV warning under --debug-prerender',
        inTerminal(async () => {
          // The CLI sets NODE_ENV for this flag; the build child inherits it and
          // must not mistake it for one the user set.
          await startBuild(['--debug-prerender'])
          terminal.write('\x03')
          expect(await exit).toMatchObject({ exitCode: 130 })
          expect(output).not.toContain('non-standard "NODE_ENV" value')
        })
      )

      it(
        'keeps the menu quiet when .env opts out of telemetry',
        inTerminal(async () => {
          const log = path.join(next.testDir, 'telemetry.log')
          await fs.writeFile(
            path.join(next.testDir, '.env'),
            'NEXT_TELEMETRY_DISABLED=1\n'
          )
          try {
            // Only .env opts out, and a preload logs what would be sent.
            await startBuild([], {
              NEXT_TELEMETRY_DISABLED: undefined,
              NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --require ${path.join(next.testDir, 'telemetry-hook.cjs')}`,
              UPGRADE_TERMINAL_TELEMETRY_LOG: log,
            })
            terminal.write(SKIP)
            expect(await exit).toMatchObject({ exitCode: 0 })
            const events = (await fs.pathExists(log))
              ? await fs.readFile(log, 'utf8')
              : ''
            expect(events).not.toContain('NEXT_AGENT_UPGRADE')
          } finally {
            await fs.remove(path.join(next.testDir, '.env'))
            await fs.remove(log)
          }
        }),
        BUILD_TIMEOUT
      )

      it(
        'waits for Skip before completing generate-env',
        inTerminal(async () => {
          await startBuild(['--experimental-build-mode', 'generate-env'])
          // The build child finished; the CLI still waits for an answer.
          await retry(() => expect(childPids(terminal.pid)).toEqual([]), 60_000)
          expect(exited).toBe(false)
          terminal.write(SKIP)
          expect(await exit).toMatchObject({ exitCode: 0 })
        })
      )
    })
  }
})
