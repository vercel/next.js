import { spawn, type IPty } from 'node-pty'
import { nextTestSetup } from 'e2e-utils'
import { findPort, retry } from 'next-test-utils'

describe('agent upgrade terminal', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    // This test drives a local interactive CLI, which deployments cannot expose.
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  describe('dev', () => {
    if (!isNextDev) {
      return it.skip('only runs with Next.js dev', () => {})
    }

    let terminal: IPty
    let output: string
    let port: number
    let exit: Promise<{ exitCode: number; signal?: number }>
    let exited: boolean

    beforeEach(async () => {
      // Give each case fresh output and an unused port.
      output = ''
      exited = false
      port = await findPort()

      // Copy the runner's environment so test-only changes stay in this child.
      const env = { ...process.env }

      // node-pty sets TERM from name on Unix but not Windows; override an
      // inherited TERM=dumb so the menu stays available.
      env.TERM = 'xterm-256color'

      // Show a deterministic human menu even under an agent or CI.
      env.__NEXT_AGENT_UPGRADE_FORCE_TERMINAL_FOR_TESTING = '1'

      // Pin the upgrade to this locally built Next.js CLI. This skips npm's
      // canary lookup and reaches the security guard deterministically.
      env.__NEXT_UPGRADE_EXPECTED_CLI_VERSION =
        require('next/package.json').version

      // Run the real dev CLI in a PTY, matching the test runner's bundler and
      // binding a local port, to exercise real TTY output and menu input.
      terminal = spawn(
        process.execPath,
        [
          require.resolve('next/dist/bin/next'),
          'dev',
          next.testDir,
          ...(process.env.IS_WEBPACK_TEST ? ['--webpack'] : []),
          '-p',
          String(port),
          '-H',
          '127.0.0.1',
        ],
        {
          cwd: next.testDir,
          env,
          name: 'xterm-256color',
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

      // Start each test only after the menu is visible and ready for input.
      await retry(() => {
        expect(output).toContain('Upgrade now')
      }, 15_000)

      // The menu can appear before dev is ready; prove it is serving before
      // testing how each choice affects the running server.
      await retry(async () => {
        const response = await fetch(`http://127.0.0.1:${port}/`)
        expect(response.status).toBe(200)
        expect(await response.text()).toContain('hello world')
      }, 15_000)
    })

    afterEach(async () => {
      if (!exited) {
        terminal.kill('SIGTERM')
      }
      await exit
    })

    it('keeps config and route logs off the menu and replays route logs after Skip', async () => {
      // Config output precedes the menu, whose screen clear removes it from view.
      const menuStart = output.lastIndexOf('\x1b[H\x1b[2J')
      expect(menuStart).toBeGreaterThan(-1)
      expect(output.slice(0, menuStart)).toContain(
        'UPGRADE_TERMINAL_CONFIG_LOADED'
      )
      expect(output.slice(menuStart)).not.toContain(
        'UPGRADE_TERMINAL_CONFIG_LOADED'
      )

      // Keep route logs buffered while the upgrade menu owns the terminal.
      expect(output).not.toContain('UPGRADE_TERMINAL_ROUTE_RENDERED')

      // Down selects Skip instead of the default Upgrade now; Return confirms it.
      terminal.write('\x1b[B\r')
      await retry(() => {
        expect(output).toContain('UPGRADE_TERMINAL_ROUTE_RENDERED TTY=true')
      }, 15_000)

      const response = await fetch(`http://127.0.0.1:${port}/`)
      expect(response.status).toBe(200)
      expect(await response.text()).toContain('hello world')
      expect(exited).toBe(false)
    })

    it('stops dev on Upgrade now', async () => {
      terminal.write('\r')
      // Security upgrades reject canary releases, so the upgrade CLI exits
      // with an error after the dev server shuts down.
      expect((await exit).exitCode).toBe(1)
      expect(output).toContain('Could not prepare the upgrade:')
      expect(output).toContain('Security advisories target stable versions')
      await expect(fetch(`http://127.0.0.1:${port}/`)).rejects.toThrow()
    })

    it('stops dev when Ctrl+C is pressed in the menu', async () => {
      terminal.write('\x03')
      expect((await exit).exitCode).toBe(130)
      await expect(fetch(`http://127.0.0.1:${port}/`)).rejects.toThrow()
    })
  })

  if (!isNextDev) {
    describe('build', () => {
      let terminal: IPty
      let output: string
      let exit: Promise<{ exitCode: number; signal?: number }>
      let exited: boolean

      async function startBuild(
        mode: 'default' | 'generate-env' = 'default',
        overflowMenu = false
      ) {
        output = ''
        exited = false
        const env = { ...process.env }
        env.TERM = 'xterm-256color'
        env.__NEXT_AGENT_UPGRADE_FORCE_TERMINAL_FOR_TESTING = '1'
        if (overflowMenu) {
          env.UPGRADE_TERMINAL_TEST_OVERFLOW = '1'
        }
        env.__NEXT_UPGRADE_EXPECTED_CLI_VERSION =
          require('next/package.json').version

        terminal = spawn(
          process.execPath,
          [
            // Build with the fixture's installed Next so app and framework
            // resolve the same React instance during prerendering.
            require.resolve('next/dist/bin/next', { paths: [next.testDir] }),
            'build',
            next.testDir,
            ...(mode === 'generate-env'
              ? ['--experimental-build-mode', 'generate-env']
              : []),
            ...(process.env.IS_WEBPACK_TEST ? ['--webpack'] : []),
          ],
          {
            cwd: next.testDir,
            env,
            name: 'xterm-256color',
            cols: 80,
            rows: 24,
          }
        )
        terminal.onData((data) => {
          output += data
        })
        exit = new Promise((resolve) => {
          terminal.onExit((event) => {
            exited = true
            resolve(event)
          })
        })
        await retry(() => {
          expect(output).toContain('Upgrade now')
        }, 30_000)
      }

      afterEach(async () => {
        if (!exited) {
          terminal.kill('SIGTERM')
        }
        await exit
      })

      it('finishes the build after Skip', async () => {
        await startBuild()
        terminal.write('\x1b[B\r')
        expect((await exit).exitCode).toBe(0)
        expect(output).toContain('UPGRADE_TERMINAL_CONFIG_LOADED')
        expect(output).toContain('Compiled successfully')
      })

      it('stops the build before starting the upgrade', async () => {
        await startBuild()
        terminal.write('\r')
        expect((await exit).exitCode).toBe(1)
        expect(output).toContain('Security advisories target stable versions')
      })

      it('reports Ctrl+C as an interrupt', async () => {
        await startBuild()
        terminal.write('\x03')
        expect((await exit).exitCode).toBe(130)
      })

      it('waits for Skip before completing generate-env', async () => {
        await startBuild('generate-env')
        expect(exited).toBe(false)
        terminal.write('\x1b[B\r')
        expect((await exit).exitCode).toBe(0)
      })

      it('finishes the build when output closes the menu', async () => {
        await startBuild('default', true)
        await retry(() => {
          expect(exited).toBe(true)
        }, 30_000)
        expect((await exit).exitCode).toBe(0)
        expect(output).toContain(
          'Upgrade menu closed because buffered command output reached 1 MiB.'
        )
      })
    })
  }
})
