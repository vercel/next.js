import { existsSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { createRequire } from 'module'
import { join } from 'path'
import resolveFrom from 'resolve-from'
import { isNextDev, nextTestSetup } from 'e2e-utils'
import { findPort, retry } from 'next-test-utils'

describe('agent upgrade prompt', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })

  // TODO: Add the next build case in start mode using this terminal fixture.
  describe('next dev', () => {
    if (!isNextDev) {
      it.skip('runs only in dev mode', () => {})
      return
    }

    // Start the real next dev CLI in a PTY so it sees an interactive terminal.
    // Normal mode runs without an upgrade policy; prompt mode lets us send
    // menu keys and inspect exactly what the user would see.
    async function startDev(
      mode: 'normal' | 'prompt' = 'prompt',
      waitForShutdown: boolean = false
    ) {
      const nextBin = process.env.NEXT_SKIP_ISOLATE
        ? join(process.cwd(), 'packages/next/dist/bin/next')
        : resolveFrom(next.testDir, 'next/dist/bin/next')
      const pty = createRequire(nextBin)('node-pty')
      const port = await findPort()
      const env = { ...process.env }

      if (mode === 'normal') {
        delete env.__NEXT_AGENTIC_AUTO_UPGRADE
        delete env.NEXT_PRIVATE_UPGRADE_SUPERVISED
      } else {
        env.__NEXT_AGENTIC_AUTO_UPGRADE = 'future'
      }

      if (waitForShutdown) {
        // Normally next dev SIGKILLs its worker after 100 ms. Disable that
        // timeout so the fixture's pending after() stays alive long enough to
        // observe upgrade startup, then release it explicitly in the test.
        env.__NEXT_DEV_WAIT_FOR_TURBOPACK_SHUTDOWN = '1'
      }

      // This test simulates a human terminal even when CI runs inside an agent.
      delete env.AI_AGENT
      delete env.CODEX_SANDBOX
      delete env.CODEX_CI
      delete env.CODEX_THREAD_ID

      const terminal = pty.spawn(
        process.execPath,
        [nextBin, 'dev', '-p', String(port), '-H', '127.0.0.1'],
        {
          cwd: next.testDir,
          env,
          name: 'xterm-256color',
          cols: 100,
          rows: 30,
        }
      )
      let output = ''
      let exited = false
      let exitCode: number | undefined
      let exitSignal: number | undefined
      terminal.onData((data: string) => {
        output += data
      })
      terminal.onExit(({ exitCode: code, signal }) => {
        exited = true
        exitCode = code
        exitSignal = signal
      })

      return {
        port,
        terminal,
        get output() {
          return output
        },
        get exited() {
          return exited
        },
        get exitCode() {
          return exitCode
        },
        // node-pty reports a signal separately; convert it to shell status.
        get exitStatus() {
          return exitSignal ? 128 + exitSignal : exitCode
        },
        async stop(skipPrompt: boolean = true) {
          if (!exited) {
            // Leave the menu through Skip before stopping prompted dev.
            if (mode === 'prompt' && skipPrompt) {
              terminal.write('\x1b[B\r')
            }
            terminal.write('\x03')
            try {
              await retry(async () => {
                expect(exited).toBe(true)
              })
            } finally {
              if (!exited) {
                terminal.kill()
              }
            }
          }
        },
      }
    }

    it('serves requests without showing dev logs over the prompt', async () => {
      await next.patchFile(
        'next.config.js',
        'module.exports = {}\n',
        async () => {
          const normal = await startDev('normal')
          try {
            // Without a policy, the real dev CLI prints its startup log directly.
            await retry(async () => {
              expect(normal.output).toContain('Ready in')
            }, 10_000)
            expect(normal.output).not.toContain('Upgrade now')
            expect(normal.output).not.toContain('\x1b[?1049h')
          } finally {
            await normal.stop()
          }
        }
      )

      // Start the same fixture with the prompt enabled to compare terminal output.
      const dev = await startDev()

      try {
        // The requested upgrade ensures an offer even without a newer release.
        // The real dev server must serve while the terminal menu remains open.
        await retry(async () => {
          expect(dev.output).toContain('Upgrade now')
        }, 10_000)

        // A successful request proves dev continues working beneath the menu.
        const response = await retry(
          () => fetch(`http://127.0.0.1:${dev.port}/`),
          10_000
        )
        expect(response.status).toBe(200)
        expect(await response.text()).toContain('hello world')
        // The startup log may precede the menu; later request logs must not
        // draw over it while the menu owns the terminal.
        // app/page.tsx logs this marker, but dev output stays behind the menu.
        expect(dev.output).not.toContain('UPGRADE_REQUEST_LOG')
        // promptUpgrade() writes this when leaving the alternate screen.
        expect(dev.output).not.toContain('\x1b[?1049l')
      } finally {
        await dev.stop()
      }
    })

    it('shows dev startup logs while checking the upgrade, then captures menu logs', async () => {
      const started = join(next.testDir, 'upgrade-assessment-started')
      const release = join(next.testDir, 'upgrade-assessment-release')

      await next.patchFile(
        'next.config.js',
        `const { existsSync, watch, writeFileSync } = require('fs')
const { join } = require('path')

// Hold the parent CLI's network assessment until the real dev server is ready.
// The PTY child keeps its ordinary fetch implementation.
if (!process.env.NEXT_PRIVATE_UPGRADE_SUPERVISED) {
  global.fetch = async () => {
    const started = join(process.cwd(), 'upgrade-assessment-started')
    const release = join(process.cwd(), 'upgrade-assessment-release')
    writeFileSync(started, '')
    if (!existsSync(release)) {
      await new Promise((resolve) => {
        const watcher = watch(process.cwd(), () => {
          if (existsSync(release)) {
            watcher.close()
            resolve()
          }
        })
        if (existsSync(release)) {
          watcher.close()
          resolve()
        }
      })
    }
    return new Response('', { status: 503 })
  }
}
module.exports = { experimental: { agenticAutoUpgrade: 'future' } }
`,
        async () => {
          const dev = await startDev()
          try {
            await retry(async () => {
              expect(existsSync(started)).toBe(true)
              expect(dev.output).toContain('Ready in')
            }, 10_000)
            expect(dev.output).not.toContain('Upgrade now')

            // Once assessment finishes, only output produced during the menu
            // is captured and replayed when the user chooses Skip.
            writeFileSync(release, '')
            await retry(async () => {
              expect(dev.output).toContain('Upgrade now')
            }, 10_000)
            const response = await retry(
              () => fetch(`http://127.0.0.1:${dev.port}/`),
              10_000
            )
            expect(response.status).toBe(200)
            expect(dev.output).not.toContain('UPGRADE_REQUEST_LOG')

            dev.terminal.write('\x1b[B\r')
            await retry(async () => {
              expect(dev.output).toContain('UPGRADE_REQUEST_LOG')
            })
            expect(dev.output.match(/UPGRADE_REQUEST_LOG/g)).toHaveLength(1)
          } finally {
            writeFileSync(release, '')
            await dev.stop(false)
            rmSync(started, { force: true })
            rmSync(release, { force: true })
          }
        }
      )
    })

    it('reloads .env values while dev runs under the prompt', async () => {
      await next.patchFile(
        '.env',
        'UPGRADE_ENV_RELOAD_VALUE=before\n',
        async () => {
          const dev = await startDev()
          try {
            await retry(async () => {
              expect(dev.output).toContain('Upgrade now')
            }, 10_000)

            const page = () => fetch(`http://127.0.0.1:${dev.port}/`)
            await retry(async () => {
              expect(await (await page()).text()).toContain(
                'data-env-value="before"'
              )
            }, 10_000)

            // The supervisor must not pass its loaded .env value as an inherited
            // variable; otherwise the child cannot replace it on file reload.
            await next.patchFile(
              '.env',
              'UPGRADE_ENV_RELOAD_VALUE=after\n',
              async () => {
                await retry(async () => {
                  expect(await (await page()).text()).toContain(
                    'data-env-value="after"'
                  )
                }, 10_000)
              }
            )
          } finally {
            await dev.stop()
          }
        }
      )
    })

    it('removes app env values from the prompt supervisor after preflight', async () => {
      const resultPath = join(next.testDir, 'upgrade-preflight-env-result')
      try {
        await next.patchFile(
          '.env',
          'UPGRADE_PREFLIGHT_ENV_TEST=fixture-only\n',
          async () => {
            await next.patchFile(
              'next.config.js',
              `if (!process.env.NEXT_PRIVATE_UPGRADE_SUPERVISED) {
  process.on('exit', () => {
    require('fs').writeFileSync(${JSON.stringify(resultPath)}, process.env.UPGRADE_PREFLIGHT_ENV_TEST || '')
  })
}
module.exports = { experimental: { agenticAutoUpgrade: 'future' } }
`,
              async () => {
                const dev = await startDev()
                try {
                  await retry(async () => {
                    expect(dev.output).toContain('Upgrade now')
                  }, 10_000)

                  // The config's exit hook observes the supervisor process.
                  // The PTY child has a separate environment and skips it.
                  dev.terminal.write('\x03')
                  await retry(async () => {
                    expect(dev.exited).toBe(true)
                    expect(readFileSync(resultPath, 'utf8')).toBe('')
                  }, 10_000)
                } finally {
                  await dev.stop(false)
                }
              }
            )
          }
        )
      } finally {
        rmSync(resultPath, { force: true })
      }
    })

    it('stops dev and its worker when the outer CLI receives SIGTERM', async () => {
      const dev = await startDev()
      let serverPid = 0
      let devPid = 0
      try {
        await retry(async () => {
          expect(dev.output).toContain('Upgrade now')
        }, 10_000)

        const response = await retry(
          () => fetch(`http://127.0.0.1:${dev.port}/`),
          10_000
        )
        const body = await response.text()
        serverPid = Number(body.match(/data-server-pid="(\d+)"/)?.[1])
        devPid = Number(body.match(/data-dev-pid="(\d+)"/)?.[1])
        expect(serverPid).toBeGreaterThan(0)
        expect(devPid).toBeGreaterThan(0)

        // Terminate the invoking CLI, not its PTY child, to exercise signal
        // forwarding through the supervisor while the menu is still open.
        process.kill(dev.terminal.pid, 'SIGTERM')
        await retry(async () => {
          expect(dev.exited).toBe(true)
          expect(() => process.kill(devPid, 0)).toThrow()
          expect(() => process.kill(serverPid, 0)).toThrow()
        }, 10_000)
      } finally {
        await dev.stop(false)
        // If the assertion fails, do not leave a dev server behind.
        for (const pid of [devPid, serverPid]) {
          if (pid) {
            try {
              process.kill(pid, 'SIGKILL')
            } catch {}
          }
        }
      }
    })

    it('replays captured dev logs once on Skip, then streams new logs', async () => {
      const dev = await startDev()
      try {
        await retry(async () => {
          expect(dev.output).toContain('Upgrade now')
        }, 10_000)
        // Generate a server log while the menu owns the terminal.
        const firstResponse = await retry(
          () => fetch(`http://127.0.0.1:${dev.port}/`),
          10_000
        )
        expect(firstResponse.status).toBe(200)
        // app/page.tsx logged the marker; Skip has not replayed it yet.
        expect(dev.output).not.toContain('UPGRADE_REQUEST_LOG')

        // Skip must leave the menu before replaying the captured log, once.
        dev.terminal.write('\x1b[B\r')
        await retry(async () => {
          expect(dev.output).toContain('UPGRADE_REQUEST_LOG')
          expect(dev.output).toContain('\x1b[?1049l')
        })
        expect(dev.output.indexOf('\x1b[?1049l')).toBeLessThan(
          dev.output.indexOf('UPGRADE_REQUEST_LOG')
        )
        expect(dev.output.match(/UPGRADE_REQUEST_LOG/g)).toHaveLength(1)

        // Later requests should stream normally rather than replay old output.
        const replayEnd = dev.output.length
        const response = await fetch(`http://127.0.0.1:${dev.port}/`)
        expect(response.status).toBe(200)
        await retry(async () => {
          expect(dev.output.slice(replayEnd)).toContain('UPGRADE_REQUEST_LOG')
        })
        expect(dev.output.match(/UPGRADE_REQUEST_LOG/g)).toHaveLength(2)
      } finally {
        await dev.stop()
      }
    })

    it('lets ordinary dev report an invalid config after prompt preflight fails', async () => {
      await next.patchFile(
        'next.config.js',
        'throw new Error("INVALID_CONFIG_TEST")\n',
        async () => {
          const dev = await startDev()
          try {
            await retry(async () => {
              expect(dev.output).toContain('INVALID_CONFIG_TEST')
              expect(dev.exited).toBe(true)
            }, 10_000)
            expect(dev.output).not.toContain('Upgrade now')
            expect(dev.exitCode).toBeGreaterThan(0)
          } finally {
            await dev.stop(false)
          }
        }
      )
    })

    it('returns 130 when Ctrl+C interrupts the upgrade menu', async () => {
      const dev = await startDev()
      try {
        await retry(async () => {
          expect(dev.output).toContain('Upgrade now')
        }, 10_000)
        dev.terminal.write('\x03')
        await retry(async () => {
          expect(dev.exited).toBe(true)
        }, 10_000)
        expect(dev.exitCode).toBe(130)
      } finally {
        await dev.stop(false)
      }
    })

    it('returns 130 when SIGINT is sent directly to the outer CLI', async () => {
      const dev = await startDev()
      try {
        await retry(async () => {
          expect(dev.output).toContain('Upgrade now')
        }, 10_000)

        // IDEs and task runners can signal the supervisor PID directly,
        // instead of sending the Ctrl+C byte through the terminal.
        process.kill(dev.terminal.pid, 'SIGINT')
        await retry(async () => {
          expect(dev.exited).toBe(true)
        }, 10_000)
        expect(dev.exitStatus).toBe(130)
      } finally {
        await dev.stop(false)
      }
    })

    it('terminates when the terminal stops reading during replay', async () => {
      const dev = await startDev()
      try {
        await retry(async () => {
          expect(dev.output).toContain('Upgrade now')
        }, 10_000)

        // Emit enough output from a request made while the menu is open to
        // leave replay pending after the terminal stops reading.
        const response = await retry(
          () => fetch(`http://127.0.0.1:${dev.port}/?flood=1`),
          10_000
        )
        expect(response.status).toBe(200)
        expect(dev.output).not.toContain('UPGRADE_REPLAY_FLOOD_BEGIN')

        // Pause at the prompt's screen exit, before the captured log can
        // finish replaying. This also ensures Skip was handled before the
        // signal, rather than racing the prompt's own cleanup.
        const replayStarted = new Promise<void>((resolve) => {
          const listener = dev.terminal.onData((data: string) => {
            if (data.includes('\x1b[?1049l')) {
              dev.terminal.pause()
              listener.dispose()
              resolve()
            }
          })
        })
        dev.terminal.write('\x1b[B\r')
        await replayStarted
        expect(dev.output).not.toContain('UPGRADE_REPLAY_FLOOD_END')

        // SIGTERM must end the supervisor even if stdout never drains.
        process.kill(dev.terminal.pid, 'SIGTERM')
        await retry(async () => {
          expect(dev.exited).toBe(true)
        }, 5_000)
        expect(dev.exitStatus).toBe(143)
      } finally {
        dev.terminal.resume()
        await dev.stop(false)
      }
    })

    if (process.platform !== 'win32') {
      it('keeps the prompt open when the server worker dies, then exits on Skip', async () => {
        const dev = await startDev()
        let serverPid = 0
        let devPid = 0
        try {
          await retry(async () => {
            expect(dev.output).toContain('Upgrade now')
          }, 10_000)

          // The response identifies the server worker and its inner dev CLI.
          const response = await retry(
            () => fetch(`http://127.0.0.1:${dev.port}/`),
            10_000
          )
          const body = await response.text()
          serverPid = Number(body.match(/data-server-pid="(\d+)"/)?.[1])
          devPid = Number(body.match(/data-dev-pid="(\d+)"/)?.[1])
          expect(serverPid).toBeGreaterThan(0)
          expect(devPid).toBeGreaterThan(0)

          // Kill only the worker. The inner CLI should clean up and exit, but
          // the separate prompt must remain available for the user's choice.
          process.kill(serverPid, 'SIGKILL')
          await retry(async () => {
            expect(() => process.kill(devPid, 0)).toThrow()
          }, 10_000)
          expect(dev.exited).toBe(false)

          dev.terminal.write('\x1b[B\r')
          await retry(async () => {
            expect(dev.exited).toBe(true)
          })
          expect(dev.exitStatus).toBe(137)
        } finally {
          await dev.stop(false)
          for (const pid of [devPid, serverPid]) {
            if (pid) {
              try {
                process.kill(pid, 'SIGKILL')
              } catch {}
            }
          }
        }
      })

      it('returns the signal status when the PTY child is killed', async () => {
        const dev = await startDev()
        let devPid = 0
        let serverPid = 0
        try {
          await retry(async () => {
            expect(dev.output).toContain('Upgrade now')
          }, 10_000)
          const response = await retry(
            () => fetch(`http://127.0.0.1:${dev.port}/`),
            10_000
          )
          const body = await response.text()
          devPid = Number(body.match(/data-dev-pid="(\d+)"/)?.[1])
          serverPid = Number(body.match(/data-server-pid="(\d+)"/)?.[1])
          expect(devPid).toBeGreaterThan(0)

          dev.terminal.write('\x1b[B\r')
          await retry(async () => {
            expect(dev.output).toContain('UPGRADE_REQUEST_LOG')
          })
          process.kill(devPid, 'SIGKILL')
          await retry(async () => {
            expect(dev.exited).toBe(true)
          }, 10_000)
          expect(dev.exitCode).toBe(137)
        } finally {
          await dev.stop(false)
          if (serverPid) {
            try {
              process.kill(serverPid, 'SIGKILL')
            } catch {}
          }
        }
      })

      it('returns to the shell on Ctrl+Z and resumes dev with fg', async () => {
        const nextBin = process.env.NEXT_SKIP_ISOLATE
          ? join(process.cwd(), 'packages/next/dist/bin/next')
          : resolveFrom(next.testDir, 'next/dist/bin/next')
        const pty = createRequire(nextBin)('node-pty')
        const port = await findPort()
        const env: NodeJS.ProcessEnv = {
          ...process.env,
          __NEXT_AGENTIC_AUTO_UPGRADE: 'future',
        }
        delete env.AI_AGENT
        delete env.CODEX_SANDBOX
        delete env.CODEX_CI
        delete env.CODEX_THREAD_ID
        env.PS1 = 'UPGRADE_SHELL> '
        const shell = pty.spawn('/bin/bash', ['--noprofile', '--norc', '-i'], {
          cwd: next.testDir,
          env,
          name: 'xterm-256color',
          cols: 100,
          rows: 30,
        })
        let output = ''
        let exited = false
        shell.onData((data: string) => {
          output += data
        })
        shell.onExit(() => {
          exited = true
        })
        const quote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`

        try {
          await retry(async () => {
            expect(output).toContain('UPGRADE_SHELL>')
          })
          shell.write(
            `${quote(process.execPath)} ${quote(nextBin)} dev -p ${port} -H 127.0.0.1\r`
          )
          await retry(async () => {
            expect(output).toContain('Upgrade now')
          }, 10_000)
          shell.write('\x1b[B\r')
          await retry(async () => {
            expect(output).toContain('Ready in')
          }, 10_000)

          // The shell must regain its prompt while the Next process is stopped.
          const beforeSuspend = output.length
          shell.write('\x1a')
          await retry(async () => {
            expect(output.slice(beforeSuspend)).toContain('Stopped')
            expect(output.slice(beforeSuspend)).toContain('UPGRADE_SHELL>')
          }, 10_000)

          // fg must resume the child PTY as well as the supervisor. A request
          // log after fg proves the dev CLI can still write to the terminal.
          shell.write('fg\r')
          const afterResume = output.length
          const response = await retry(
            () => fetch(`http://127.0.0.1:${port}/`),
            10_000
          )
          expect(response.status).toBe(200)
          await retry(async () => {
            expect(output.slice(afterResume)).toContain('UPGRADE_REQUEST_LOG')
          }, 10_000)

          shell.write('\x03')
          await retry(async () => {
            expect(output.slice(afterResume)).toContain('UPGRADE_SHELL>')
          }, 10_000)
        } finally {
          if (!exited) {
            shell.write('\x03')
            shell.write('exit\r')
            try {
              await retry(async () => {
                expect(exited).toBe(true)
              }, 5_000)
            } finally {
              if (!exited) {
                shell.kill()
              }
            }
          }
        }
      })
    }

    it('starts Upgrade now before shutdown finishes, then stops dev and its worker', async () => {
      // Keep the worker alive until the test releases its pending after().
      const dev = await startDev('prompt', true)
      let releasePath = ''
      let readyPath = ''

      try {
        // Wait until the menu is visible before making the request that will
        // hold the server worker open during shutdown.
        await retry(async () => {
          expect(dev.output).toContain('Upgrade now')
        }, 10_000)

        let serverPid = 0
        let devPid = 0

        // The fixture holds graceful shutdown until we create its release file.
        // Its response exposes the parent and server PIDs for the exit checks.
        const response = await retry(
          () => fetch(`http://127.0.0.1:${dev.port}/?hold=1`),
          10_000
        )
        expect(response.status).toBe(200)

        // The page exposes its own PID and its parent dev PID in HTML attributes.
        // We need both to verify that shutdown eventually stops both processes.
        const body = await response.text()
        serverPid = Number(body.match(/data-server-pid="(\d+)"/)?.[1])
        devPid = Number(body.match(/data-dev-pid="(\d+)"/)?.[1])
        expect(serverPid).toBeGreaterThan(0)
        expect(devPid).toBeGreaterThan(0)

        readyPath = join(next.testDir, `upgrade-ready-${serverPid}`)
        releasePath = join(next.testDir, `upgrade-release-${serverPid}`)

        // The ready file means after() is waiting for the release file.
        await retry(async () => {
          expect(existsSync(readyPath)).toBe(true)
        }, 5_000)

        // Enter selects Upgrade now, which starts the real next upgrade --ai.
        dev.terminal.write('\r')

        // The real upgrade command prints this before looking up its target.
        // Seeing it while the server is alive proves the parent did not wait
        // for graceful shutdown to finish.
        await retry(async () => {
          expect(dev.output).toContain('Preparing upgrade...')
        }, 10_000)

        expect(process.kill(serverPid, 0)).toBe(true)

        // Stop upgrade preparation, release after(), and verify both Next
        // processes eventually exit without launching an agent.
        if (!dev.exited) {
          dev.terminal.write('\x03')
        }
        writeFileSync(releasePath, '')

        await retry(async () => {
          expect(dev.exited).toBe(true)
          expect(() => process.kill(serverPid, 0)).toThrow()
          expect(() => process.kill(devPid, 0)).toThrow()
        }, 15_000)
      } finally {
        // Always unblock shutdown, including when an earlier assertion fails.
        if (releasePath) {
          writeFileSync(releasePath, '')
        }

        // The upgrade menu is gone, so do not send a Skip selection here.
        await dev.stop(false)

        if (readyPath) {
          rmSync(readyPath, { force: true })
          rmSync(releasePath, { force: true })
        }
      }
    })
  })
})
