import { nextTestSetup } from 'e2e-utils'
import { findPort, killApp, retry } from 'next-test-utils'
import path, { join } from 'path'
// @ts-expect-error
import pkg from 'next/package'
import http from 'http'
import stripAnsi from 'strip-ansi'
import type { ChildProcess } from 'child_process'

const itCI = process.env.NEXT_TEST_CI ? it : it.skip

const reactDependencies = {
  react: '19.3.0-canary-fef12a01-20260413',
  'react-dom': '19.3.0-canary-fef12a01-20260413',
}

describe('CLI Usage', () => {
  const { next, isNextStart } = nextTestSetup({
    files: join(__dirname, 'basic'),
    skipStart: true,
    dependencies: reactDependencies,
    skipDeployment: true,
  })

  /**
   * Start a long-running Next.js CLI command (e.g. `next dev`, `next start`)
   * and return a handle for externally killing it.
   *
   * Waits for `readyPattern` to match in stdout before resolving so callers can
   * make assertions against a running server. If the process exits before the
   * pattern matches, the returned promise resolves anyway and the caller can
   * inspect the captured output.
   */
  async function launchDevServer(
    args: string[],
    opts: {
      env?: Record<string, string>
      cwd?: string
      onStdout?: (msg: string) => void
      onStderr?: (msg: string) => void
      /** Pattern signaling the server is ready. */
      readyPattern?: RegExp
    } = {}
  ): Promise<{ child: ChildProcess; exit: Promise<any> }> {
    const readyPattern = opts.readyPattern ?? /- Local:|✓ Ready/i
    let child!: ChildProcess
    let ready = false
    let resolveReady!: () => void
    const readyPromise = new Promise<void>((r) => {
      resolveReady = () => {
        if (!ready) {
          ready = true
          r()
        }
      }
    })

    const exit = next
      .runCommand(args, {
        env: opts.env,
        cwd: opts.cwd,
        onStdout: (msg) => {
          opts.onStdout?.(msg)
          if (readyPattern.test(stripAnsi(msg))) resolveReady()
        },
        onStderr: (msg) => {
          opts.onStderr?.(msg)
          if (readyPattern.test(stripAnsi(msg))) resolveReady()
        },
        instance: (p) => {
          child = p
        },
      })
      .finally(() => {
        resolveReady()
      })

    await readyPromise
    return { child, exit }
  }

  const runAndCaptureOutput = async ({ port }: { port: number }) => {
    let stdout = ''
    let stderr = ''

    let app = http.createServer((_, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end('OK')
    })

    await new Promise<void>((resolve, reject) => {
      app.on('error', reject)
      app.on('listening', () => resolve())
      app.listen(port)
    })

    const { child, exit } = await launchDevServer(
      ['dev', next.testDir, '-p', String(port)],
      {
        onStdout(msg) {
          stdout += msg
        },
        onStderr(msg) {
          stderr += msg
        },
      }
    )

    try {
      // Give the server a moment to emit the port-in-use error if it hasn't
      // already been emitted before the ready pattern matched.
      await retry(
        () => {
          if (!stderr.includes('already in use') && child.exitCode === null) {
            throw new Error('waiting for port conflict error')
          }
        },
        5000,
        100
      ).catch(() => {})
    } finally {
      await killApp(child).catch(() => {})
      await exit.catch(() => {})
    }

    await new Promise((resolve) => app.close(resolve))

    return { stdout, stderr }
  }

  const testExitSignal = async (
    killSignal: NodeJS.Signals | '' = '',
    args: string[] = [],
    readyRegex = /Creating an optimized production/,
    expectedCode = 0
  ) => {
    let instance: ChildProcess | undefined
    let output = ''

    const cmdPromise = next
      .runCommand(args, {
        ignoreFail: true,
        instance: (p) => {
          instance = p
        },
        onStdout: (msg) => {
          output += stripAnsi(msg)
        },
      })
      .catch((err) => expect.fail(err.message))

    await retry(() => {
      expect(output).toMatch(readyRegex)
    })
    instance!.kill(killSignal as NodeJS.Signals)

    const { code, signal } = await cmdPromise
    // Node can only partially emulate signals on Windows. Our signal handlers won't affect the exit code.
    // See: https://nodejs.org/api/process.html#process_signal_events
    const expectedExitSignal = process.platform === `win32` ? killSignal : null
    expect(signal).toBe(expectedExitSignal)
    expect(code).toBe(expectedCode)
  }

  ;(isNextStart ? describe : describe.skip)('production mode', () => {
    describe('start', () => {
      test('should exit when SIGINT is signalled', async () => {
        require('console').log('before build')
        await next.deleteFile('.next')
        await next.build()
        require('console').log('build finished')

        const port = await findPort()
        await testExitSignal(
          'SIGINT',
          ['start', next.testDir, '-p', String(port)],
          /- Local:/,
          130 // 128 + 2 (SIGINT)
        )
      })
      test('should exit when SIGTERM is signalled', async () => {
        await next.deleteFile('.next')
        await next.build()
        const port = await findPort()
        await testExitSignal(
          'SIGTERM',
          ['start', next.testDir, '-p', String(port)],
          /- Local:/,
          143 // 128 + 15 (SIGTERM)
        )
      })

      test('--help', async () => {
        const help = await next.runCommand(['start', '--help'])
        expect(help.stdout).toMatch(/Starts Next.js in production mode/)
      })

      test('-h', async () => {
        const help = await next.runCommand(['start', '-h'])
        expect(help.stdout).toMatch(/Starts Next.js in production mode/)
      })

      test('should format IPv6 addresses correctly', async () => {
        await next.build()
        const port = await findPort()

        let stdout = ''
        const { child, exit } = await launchDevServer(
          ['start', next.testDir, '--hostname', '::', '--port', String(port)],
          {
            onStdout(msg) {
              stdout += msg
            },
          }
        )

        try {
          await retry(() => {
            // Only display when hostname is provided
            expect(stdout).toMatch(
              new RegExp(`Network:\\s*http://\\[::\\]:${port}`)
            )
            expect(stdout).toMatch(new RegExp(`http://\\[::1\\]:${port}`))
          })
        } finally {
          await killApp(child)
          await exit.catch(() => {})
        }
      })

      test('should warn when unknown argument provided', async () => {
        const { stderr } = await next.runCommand(['start', '--random'])
        expect(stderr).toEqual(`error: unknown option '--random'\n`)
      })
      test('should not throw UnhandledPromiseRejectionWarning', async () => {
        const { stderr } = await next.runCommand(['start', '--random'])
        expect(stderr).not.toContain('UnhandledPromiseRejectionWarning')
      })

      test('invalid directory', async () => {
        const output = await next.runCommand(['start', 'non-existent'])
        expect(output.stderr).toContain(
          'Invalid project directory provided, no such directory'
        )
      })

      test('--keepAliveTimeout string arg', async () => {
        const { stderr } = await next.runCommand([
          'start',
          '--keepAliveTimeout',
          'string',
        ])
        expect(stderr).toContain(
          `error: option '--keepAliveTimeout <keepAliveTimeout>' argument 'string' is invalid. 'string' is not a non-negative number.`
        )
      })

      test('--keepAliveTimeout negative number', async () => {
        const { stderr } = await next.runCommand([
          'start',
          '--keepAliveTimeout=-100',
        ])
        expect(stderr).toContain(
          `error: option '--keepAliveTimeout <keepAliveTimeout>' argument '-100' is invalid. '-100' is not a non-negative number.`
        )
      })

      test('--keepAliveTimeout Infinity', async () => {
        const { stderr } = await next.runCommand([
          'start',
          '--keepAliveTimeout',
          'Infinity',
        ])
        expect(stderr).toContain(
          `error: option '--keepAliveTimeout <keepAliveTimeout>' argument 'Infinity' is invalid. 'Infinity' is not a non-negative number.`
        )
      })

      test('--keepAliveTimeout happy path', async () => {
        await next.build()
        const port = await findPort()

        let stderr = ''
        const { child, exit } = await launchDevServer(
          [
            'start',
            next.testDir,
            '--keepAliveTimeout',
            '100',
            '--port',
            String(port),
          ],
          {
            onStderr(msg) {
              stderr += msg
            },
          }
        )

        try {
          expect(stderr).not.toContain(
            `error: option '--keepAliveTimeout <keepAliveTimeout>' argument '100' is invalid. '100' is not a non-negative number.`
          )
        } finally {
          await killApp(child)
          await exit.catch(() => {})
        }
      })

      test('should not start on a port out of range', async () => {
        const invalidPort = '300001'
        const { stderr } = await next.runCommand([
          'start',
          '--port',
          invalidPort,
        ])

        expect(stderr).toContain(`options.port should be >= 0 and < 65536.`)
      })

      test('should not start on a reserved port', async () => {
        const reservedPort = '4045'
        const { stderr } = await next.runCommand([
          'start',
          '--port',
          reservedPort,
        ])

        expect(stderr).toContain(
          `Bad port: "${reservedPort}" is reserved for npp`
        )
      })

      test('--inspect', async () => {
        await next.build()
        const port = await findPort()

        let output = ''
        let errOutput = ''
        const { child, exit } = await launchDevServer(
          ['start', next.testDir, '--port', String(port), '--inspect'],
          {
            onStdout(msg) {
              output += stripAnsi(msg)
            },
            onStderr(msg) {
              errOutput += stripAnsi(msg)
            },
          }
        )

        try {
          await retry(() => {
            expect(output).toMatch(new RegExp(`http://localhost:${port}`))
          })
          await retry(() => {
            expect(output).toMatch(/- Debugger port:\s+9229/)
          })
          await retry(() => {
            expect(errOutput).toMatch(/Debugger listening on/)
          })
          expect(errOutput).not.toContain('address already in use')
        } finally {
          await killApp(child)
          await exit.catch(() => {})
        }
      })
    })

    describe('telemetry', () => {
      test('--help', async () => {
        const help = await next.runCommand(['telemetry', '--help'])
        expect(help.stdout).toMatch(/Allows you to enable or disable Next\.js'/)
      })

      test('-h', async () => {
        const help = await next.runCommand(['telemetry', '-h'])
        expect(help.stdout).toMatch(/Allows you to enable or disable Next\.js'/)
      })

      test('should warn when unknown argument provided', async () => {
        const { stderr } = await next.runCommand(['telemetry', '--random'])
        expect(stderr).toEqual(`error: unknown option '--random'\n`)
      })
      test('should not throw UnhandledPromiseRejectionWarning', async () => {
        const { stderr } = await next.runCommand(['telemetry', '--random'])
        expect(stderr).not.toContain('UnhandledPromiseRejectionWarning')
      })
    })

    describe('build', () => {
      test('--help', async () => {
        const help = await next.runCommand(['build', '--help'])
        expect(help.stdout).toMatch(/Creates an optimized production build/)
      })

      test('-h', async () => {
        const help = await next.runCommand(['build', '-h'])
        expect(help.stdout).toMatch(/Creates an optimized production build/)
      })

      test('should warn when unknown argument provided', async () => {
        const { stderr } = await next.runCommand(['build', '--random'])
        expect(stderr).toEqual(`error: unknown option '--random'\n`)
      })
      test('should not throw UnhandledPromiseRejectionWarning', async () => {
        const { stderr } = await next.runCommand(['build', '--random'])
        expect(stderr).not.toContain('UnhandledPromiseRejectionWarning')
      })

      test('should exit when SIGINT is signalled', async () => {
        await testExitSignal('SIGINT', ['build', next.testDir], undefined, 130)
      })

      test('should exit when SIGTERM is signalled', async () => {
        await testExitSignal('SIGTERM', ['build', next.testDir], undefined, 143)
      })

      test('invalid directory', async () => {
        const output = await next.runCommand(['build', 'non-existent'])
        expect(output.stderr).toContain(
          'Invalid project directory provided, no such directory'
        )
      })
    })
  })

  describe('no command', () => {
    test('--help', async () => {
      const help = await next.runCommand(['--help'])
      expect(help.stdout).toMatch(
        /The Next.js CLI allows you to develop, build, start/
      )
    })

    test('-h', async () => {
      const help = await next.runCommand(['-h'])
      expect(help.stdout).toMatch(
        /The Next.js CLI allows you to develop, build, start/
      )
    })

    test('--version', async () => {
      const output = await next.runCommand(['--version'])
      expect(output.stdout).toMatch(
        new RegExp(`Next\\.js v${pkg.version.replace(/\./g, '\\.')}`)
      )
    })

    test('-v', async () => {
      const output = await next.runCommand(['--version'])
      expect(output.stdout).toMatch(
        new RegExp(`Next\\.js v${pkg.version.replace(/\./g, '\\.')}`)
      )
    })

    test('invalid directory', async () => {
      const output = await next.runCommand(['non-existent'])
      expect(output.stderr).toContain(
        'Invalid project directory provided, no such directory'
      )
    })

    test('detects command typos', async () => {
      const typos = [
        ['buidl', 'build'],
        ['buill', 'build'],
        ['biild', 'build'],
        ['starr', 'start'],
        ['dee', 'dev'],
      ]

      for (const typo of typos) {
        const output = await next.runCommand([typo[0]])
        expect(output.stderr).toContain(
          `"next ${typo[0]}" does not exist. Did you mean "next ${typo[1]}"?`
        )
      }
    })
  })

  describe('dev', () => {
    test('--help', async () => {
      const help = await next.runCommand(['dev', '--help'])
      expect(help.stdout).toMatch(/Starts Next.js in development mode/)
    })

    test('-h', async () => {
      const help = await next.runCommand(['dev', '-h'])
      expect(help.stdout).toMatch(/Starts Next.js in development mode/)
    })

    test('custom directory', async () => {
      const port = await findPort()
      let output = ''
      const { child, exit } = await launchDevServer(
        ['dev', next.testDir, '--port', String(port)],
        {
          onStdout(msg) {
            output += stripAnsi(msg)
          },
        }
      )
      try {
        await retry(() => {
          expect(output).toMatch(/- Local:/i)
        })
      } finally {
        await killApp(child)
        await exit.catch(() => {})
      }
    })

    test('--port', async () => {
      const port = await findPort()
      let output = ''
      const { child, exit } = await launchDevServer(
        ['dev', next.testDir, '--port', String(port)],
        {
          onStdout(msg) {
            output += stripAnsi(msg)
          },
        }
      )
      try {
        await retry(() => {
          expect(output).toMatch(new RegExp(`http://localhost:${port}`))
        })
        await retry(() => {
          expect(output).toMatch(
            /Network:\s*http:\/\/[\d]{1,}\.[\d]{1,}\.[\d]{1,}/
          )
        })
      } finally {
        await killApp(child)
        await exit.catch(() => {})
      }
    })

    test('--port 0', async () => {
      const port = await findPort()
      let output = ''
      const { child, exit } = await launchDevServer(
        ['dev', next.testDir, '--port', String(port)],
        {
          onStdout(msg) {
            output += stripAnsi(msg)
          },
        }
      )
      try {
        await retry(() => {
          expect(output).toMatch(new RegExp(`http://localhost:${port}`))
        })
        await retry(() => {
          expect(output).toMatch(
            /Network:\s*http:\/\/[\d]{1,}\.[\d]{1,}\.[\d]{1,}/
          )
        })
      } finally {
        await killApp(child)
        await exit.catch(() => {})
      }
      const matches = /- Local/.exec(output)
      expect(matches).not.toBe(null)

      const _port = parseInt(matches![1])
      // Regression test: port 0 was interpreted as if no port had been
      // provided, falling back to 3000.
      expect(_port).not.toBe(3000)
    })

    test('PORT=0', async () => {
      let output = ''
      const { child, exit } = await launchDevServer(['dev', next.testDir], {
        env: {
          PORT: '0',
        },
        onStdout(msg) {
          output += stripAnsi(msg)
        },
      })
      try {
        await retry(() => {
          expect(output).toMatch(/- Local:/)
        })
        // without --hostname, do not log Network: xxx
        const matches = /Network:\s*http:\/\/\[::\]:(\d+)/.exec(output)
        const _port = parseInt('' + matches)
        expect(matches).toBe(null)
        // Regression test: port 0 was interpreted as if no port had been
        // provided, falling back to 3000.
        expect(_port).not.toBe(3000)
      } finally {
        await killApp(child)
        await exit.catch(() => {})
      }
    })

    test("NODE_OPTIONS='--inspect'", async () => {
      const port = await findPort()
      let output = ''
      let errOutput = ''
      const { child, exit } = await launchDevServer(
        ['dev', next.testDir, '--port', String(port)],
        {
          onStdout(msg) {
            output += stripAnsi(msg)
          },
          onStderr(msg) {
            errOutput += stripAnsi(msg)
          },
          env: { NODE_OPTIONS: '--inspect' },
        }
      )
      try {
        await retry(() => {
          expect(output).toMatch(new RegExp(`http://localhost:${port}`))
        })
        await retry(() => {
          expect(output).toMatch(/- Debugger port:\s+\d+/)
        })
        await retry(() => {
          expect(errOutput).toMatch(/Debugger listening on/)
        })
        expect(errOutput).not.toContain('address already in use')
      } finally {
        await killApp(child)
        await exit.catch(() => {})
      }
    })

    test('--inspect', async () => {
      const port = await findPort()
      let output = ''
      let errOutput = ''
      const { child, exit } = await launchDevServer(
        ['dev', next.testDir, '--port', String(port), '--inspect'],
        {
          onStdout(msg) {
            output += stripAnsi(msg)
          },
          onStderr(msg) {
            errOutput += stripAnsi(msg)
          },
        }
      )
      try {
        await retry(() => {
          expect(output).toMatch(new RegExp(`http://localhost:${port}`))
        })
        await retry(() => {
          expect(output).toMatch(/- Debugger port:\s+9229/)
        })
        await retry(() => {
          expect(errOutput).toMatch(/Debugger listening on/)
        })
        expect(errOutput).not.toContain('address already in use')
      } finally {
        await killApp(child)
        await exit.catch(() => {})
      }
    })

    test('--inspect 0', async () => {
      const port = await findPort()
      let output = ''
      let errOutput = ''
      const { child, exit } = await launchDevServer(
        ['dev', next.testDir, '--port', String(port), '--inspect', '0'],
        {
          onStdout(msg) {
            output += stripAnsi(msg)
          },
          onStderr(msg) {
            errOutput += stripAnsi(msg)
          },
        }
      )
      try {
        await retry(() => {
          expect(output).toMatch(new RegExp(`http://localhost:${port}`))
        })
        await retry(() => {
          expect(output).toMatch(/- Debugger port:\s+\d+/)
        })
        await retry(() => {
          expect(errOutput).toMatch(/Debugger listening on/)
        })
        expect(errOutput).not.toContain('address already in use')
      } finally {
        await killApp(child)
        await exit.catch(() => {})
      }
    })

    test('--inspect [port]', async () => {
      const port = await findPort()
      let output = ''
      let errOutput = ''
      const { child, exit } = await launchDevServer(
        ['dev', next.testDir, '--port', String(port), '--inspect', '9230'],
        {
          onStdout(msg) {
            output += stripAnsi(msg)
          },
          onStderr(msg) {
            errOutput += stripAnsi(msg)
          },
        }
      )
      try {
        await retry(() => {
          expect(output).toMatch(new RegExp(`http://localhost:${port}`))
        })
        await retry(() => {
          expect(output).toMatch(/- Debugger port:\s+9230/)
        })
        await retry(() => {
          expect(errOutput).toMatch(/Debugger listening on/)
        })
        expect(errOutput).not.toContain('address already in use')
      } finally {
        await killApp(child)
        await exit.catch(() => {})
      }
    })

    test("NODE_OPTIONS='--inspect=:0'", async () => {
      const port = await findPort()
      let output = ''
      let errOutput = ''
      const { child, exit } = await launchDevServer(
        ['dev', next.testDir, '--port', String(port)],
        {
          onStdout(msg) {
            output += stripAnsi(msg)
          },
          onStderr(msg) {
            errOutput += stripAnsi(msg)
          },
          env: { NODE_OPTIONS: '--inspect=:0' },
        }
      )
      try {
        await retry(() => {
          expect(output).toMatch(new RegExp(`http://localhost:${port}`))
        })
        await retry(() => {
          expect(output).toMatch(/- Debugger port:\s+\d+/)
        })
        await retry(() => {
          expect(errOutput).toMatch(/Debugger listening on/)
        })
        expect(errOutput).not.toContain('address already in use')
        expect(errOutput).toContain('Debugger listening on')
        console.log(output)
      } finally {
        await killApp(child)
        await exit.catch(() => {})
      }
    })

    test("NODE_OPTIONS='--require=file with spaces to-require-with-node-require-option.js'", async () => {
      const port = await findPort()
      let output = ''
      let errOutput = ''
      const { child, exit } = await launchDevServer(
        ['dev', next.testDir, '--port', String(port)],
        {
          cwd: next.testDir,
          onStdout(msg) {
            output += stripAnsi(msg)
          },
          onStderr(msg) {
            errOutput += stripAnsi(msg)
          },
          env: {
            NODE_OPTIONS:
              '--require "./file with spaces to-require-with-node-require-option.js"',
          },
        }
      )
      try {
        await retry(() => {
          expect(output).toMatch(new RegExp(`http://localhost:${port}`))
        })
        expect(output).toContain(
          'FILE_WITH_SPACES_TO_REQUIRE_WITH_NODE_REQUIRE_OPTION'
        )
        expect(errOutput).toBe('')
      } finally {
        await killApp(child)
        await exit.catch(() => {})
      }
    })

    test("NODE_OPTIONS='--require=file with spaces to --require.js'", async () => {
      const port = await findPort()
      let output = ''
      let errOutput = ''
      const { child, exit } = await launchDevServer(
        ['dev', next.testDir, '--port', String(port)],
        {
          cwd: next.testDir,
          onStdout(msg) {
            output += stripAnsi(msg)
          },
          onStderr(msg) {
            errOutput += stripAnsi(msg)
          },
          env: {
            NODE_OPTIONS: '--require "./file with spaces to --require.js"',
          },
        }
      )
      try {
        await retry(() => {
          expect(output).toMatch(new RegExp(`http://localhost:${port}`))
        })
        expect(output).toContain(
          'FILE_WITH_SPACES_TO_REQUIRE_WITH_NODE_REQUIRE_OPTION'
        )
        expect(errOutput).toBe('')
      } finally {
        await killApp(child)
        await exit.catch(() => {})
      }
    })

    test('-p', async () => {
      const port = await findPort()
      let output = ''
      const { child, exit } = await launchDevServer(
        ['dev', next.testDir, '-p', String(port)],
        {
          onStdout(msg) {
            output += stripAnsi(msg)
          },
          env: { NODE_OPTIONS: '--inspect' },
        }
      )
      try {
        await retry(() => {
          expect(output).toMatch(new RegExp(`http://localhost:${port}`))
        })
      } finally {
        await killApp(child)
        await exit.catch(() => {})
      }
    })

    test('-p conflict', async () => {
      const port = await findPort()
      const { stderr, stdout } = await runAndCaptureOutput({ port })

      expect(stderr).toMatch('already in use')
      expect(stdout).not.toMatch(/ready/i)
      expect(stdout).not.toMatch('started')
      expect(stdout).not.toMatch(`${port}`)
      expect(stripAnsi(stdout).trim()).toBeFalsy()
    })

    test('Allow retry if default port is already in use', async () => {
      let output = ''
      let one: { child: ChildProcess; exit: Promise<any> } | undefined
      let two: { child: ChildProcess; exit: Promise<any> } | undefined

      try {
        one = await launchDevServer(['dev', next.testDir], {})
        two = await launchDevServer(['dev', next.testDir], {
          onStderr(msg) {
            output += stripAnsi(msg)
          },
        })
      } finally {
        if (one) {
          await killApp(one.child).catch(console.error)
          await one.exit.catch(() => {})
        }
        if (two) {
          await killApp(two.child).catch(console.error)
          await two.exit.catch(() => {})
        }
      }

      // Depending on the environment Next may or may not be able to resolve
      // the process holding the port; accept both wordings.
      expect(output).toMatch(
        /⚠ Port 3000 is in use by (an unknown process|process \d+), using available port \d+ instead\./
      )
    })

    test('-p reserved', async () => {
      const TCP_MUX_PORT = 1
      // Don't pre-bind a server to port 1 here: Next.js rejects reserved
      // ports during CLI argument parsing, before attempting to bind, so the
      // pre-bind step is unnecessary and would also fail on CI where binding
      // privileged ports (< 1024) requires root.
      let stdout = ''
      let stderr = ''
      await next.runCommand(['dev', next.testDir, '-p', String(TCP_MUX_PORT)], {
        ignoreFail: true,
        onStdout: (msg) => {
          stdout += msg
        },
        onStderr: (msg) => {
          stderr += msg
        },
      })

      expect(stdout).toMatch('')
      expect(stderr).toMatch(
        `Bad port: "${TCP_MUX_PORT}" is reserved for tcpmux`
      )
    })

    test('--hostname', async () => {
      const port = await findPort()
      let output = ''
      const { child, exit } = await launchDevServer(
        ['dev', next.testDir, '--hostname', '0.0.0.0', '--port', String(port)],
        {
          onStdout(msg) {
            output += stripAnsi(msg)
          },
        }
      )
      try {
        await retry(() => {
          expect(output).toMatch(
            new RegExp(`Network:\\s*http://0.0.0.0:${port}`)
          )
        })
        await retry(() => {
          expect(output).toMatch(new RegExp(`http://localhost:${port}`))
        })
      } finally {
        await killApp(child)
        await exit.catch(() => {})
      }
    })

    test('-H', async () => {
      const port = await findPort()
      let output = ''
      const { child, exit } = await launchDevServer(
        ['dev', next.testDir, '-H', '0.0.0.0', '--port', String(port)],
        {
          onStdout(msg) {
            output += stripAnsi(msg)
          },
        }
      )
      try {
        await retry(() => {
          expect(output).toMatch(
            new RegExp(`Network:\\s*http://0.0.0.0:${port}`)
          )
        })
        await retry(() => {
          expect(output).toMatch(new RegExp(`http://localhost:${port}`))
        })
      } finally {
        await killApp(child)
        await exit.catch(() => {})
      }
    })

    itCI('--experimental-https', async () => {
      // only runs on CI as it requires administrator privileges
      const port = await findPort()
      let output = ''
      const { child, exit } = await launchDevServer(
        ['dev', next.testDir, '--experimental-https', '--port', String(port)],
        {
          onStdout(msg) {
            output += stripAnsi(msg)
          },
        }
      )
      try {
        await retry(() => {
          expect(output).toMatch(/Network:\s*https:\/\//)
        })
        expect(output).toMatch(/Local:\s*https:\/\/localhost:(\d+)/)
        expect(output).toContain('Certificates created in')
      } finally {
        await killApp(child)
        await exit.catch(() => {})
      }
    })

    test('--experimental-https with provided key/cert', async () => {
      const keyFile = path.resolve(__dirname, 'certificates/localhost-key.pem')
      const certFile = path.resolve(__dirname, 'certificates/localhost.pem')
      const port = await findPort()
      let output = ''
      const { child, exit } = await launchDevServer(
        [
          'dev',
          next.testDir,
          '--experimental-https',
          '--experimental-https-key',
          keyFile,
          '--experimental-https-cert',
          certFile,
          '--port',
          String(port),
        ],
        {
          onStdout(msg) {
            output += stripAnsi(msg)
          },
        }
      )
      try {
        await retry(() => {
          expect(output).toMatch(/https:\/\/localhost:(\d+)/)
        })
      } finally {
        await killApp(child)
        await exit.catch(() => {})
      }
    })

    test('should format IPv6 addresses correctly', async () => {
      const port = await findPort()
      let output = ''
      const { child, exit } = await launchDevServer(
        ['dev', next.testDir, '--hostname', '::', '--port', String(port)],
        {
          onStdout(msg) {
            output += stripAnsi(msg)
          },
        }
      )
      try {
        // Only display when hostname is provided
        await retry(() => {
          expect(output).toMatch(
            new RegExp(`Network:\\s*\\http://\\[::\\]:${port}`)
          )
        })
        await retry(() => {
          expect(output).toMatch(new RegExp(`http://\\[::1\\]:${port}`))
        })
      } finally {
        await killApp(child).catch(() => {})
        await exit.catch(() => {})
      }
    })

    test('should warn when unknown argument provided', async () => {
      const { stderr } = await next.runCommand(['dev', '--random'])
      expect(stderr).toEqual(`error: unknown option '--random'\n`)
    })
    test('should not throw UnhandledPromiseRejectionWarning', async () => {
      const { stderr } = await next.runCommand(['dev', '--random'])
      expect(stderr).not.toContain('UnhandledPromiseRejectionWarning')
    })

    test('should exit when SIGINT is signalled', async () => {
      const port = await findPort()
      await testExitSignal(
        'SIGINT',
        ['dev', next.testDir, '-p', String(port)],
        /- Local:/
      )
    })
    test('should exit when SIGTERM is signalled', async () => {
      const port = await findPort()
      await testExitSignal(
        'SIGTERM',
        ['dev', next.testDir, '-p', String(port)],
        /- Local:/
      )
    })

    test('invalid directory', async () => {
      const output = await next.runCommand(['dev', 'non-existent'])
      expect(output.stderr).toContain(
        'Invalid project directory provided, no such directory'
      )
    })
  })

  describe('export', () => {
    test('--help', async () => {
      const help = await next.runCommand(['export', '--help'])
      expect(help.stderr).toMatch(
        `error: unknown option '--help'\n(Did you mean --help?)`
      )
      expect(help.code).toBe(1)
    })

    test('run export command', async () => {
      const help = await next.runCommand(['export'])
      expect(help.stderr).toMatch(
        `\`next export\` has been removed in favor of 'output: export' in next.config.js`
      )
      expect(help.code).toBe(1)
    })
  })

  describe('info', () => {
    function matchInfoOutput(stdout, { nextConfigOutput = '.*' } = {}) {
      expect(stdout).toMatch(
        new RegExp(`
Operating System:
  Platform: .*
  Arch: .*
  Version: .*
  Available memory \\(MB\\): .*
  Available CPU cores: .*
Binaries:
  Node: .*
  npm: .*
  Yarn: .*
  pnpm: .*
Relevant Packages:
  next: .*
  eslint-config-next: .*
  react: .*
  react-dom: .*
  typescript: .*${process.env.NEXT_RSPACK ? '\n  next-rspack: .*' : ''}
Next.js Config:
  output: ${nextConfigOutput}
`)
      )
    }

    test('--help', async () => {
      const help = await next.runCommand(['info', '--help'])
      expect(help.stdout).toMatch(
        /Prints relevant details about the current system which can be used to report/
      )
    })

    test('-h', async () => {
      const help = await next.runCommand(['info', '-h'])
      expect(help.stdout).toMatch(
        /Prints relevant details about the current system which can be used to report/
      )
    })

    test('should print output', async () => {
      const info = await next.runCommand(['info'])

      expect((info.stderr || '').toLowerCase()).not.toContain('error')
      matchInfoOutput(info.stdout)
    })

    test('should print output with next.config.mjs', async () => {
      let info = { stdout: '', stderr: '' }
      const originalPkg = await next.readFile('package.json')

      try {
        await next.patchFile(
          'next.config.mjs',
          `export default { output: 'standalone' }`
        )
        // Merge `type: 'module'` into the existing package.json so we keep
        // the `packageManager` field that nextTestSetup generated. Without
        // it corepack auto-fetches the latest pnpm, which is incompatible
        // with the runner's Node version on CI.
        await next.patchFile(
          'package.json',
          JSON.stringify({ ...JSON.parse(originalPkg), type: 'module' })
        )
        info = await next.runCommand(['info'], {
          cwd: next.testDir,
        })
      } finally {
        await next.deleteFile('next.config.mjs')
        await next.patchFile('package.json', originalPkg)
      }

      expect((info.stderr || '').toLowerCase()).not.toContain('error')
      matchInfoOutput(info.stdout, { nextConfigOutput: 'standalone' })
    })
  })
})

describe('CLI Usage: duplicate sass dependencies', () => {
  const { next, isNextStart, skipped } = nextTestSetup({
    files: join(__dirname, 'duplicate-sass'),
    skipStart: true,
    dependencies: reactDependencies,
    skipDeployment: true,
  })
  if (skipped) return

  // The original integration test relied on pre-existing fake `sass` and
  // `node-sass` modules in `duplicate-sass/node_modules/`. In e2e mode the
  // isolated `pnpm install` moves any pre-existing `node_modules` to
  // `.ignored`, so we recreate the fake modules and reference them in
  // `package.json` after install, before running `next dev`.
  beforeAll(async () => {
    if (!isNextStart) return
    const pkg = await next.readJSON('package.json')
    pkg.dependencies = {
      ...pkg.dependencies,
      sass: '1.0.0',
      'node-sass': '1.0.0',
    }
    await next.patchFile('package.json', JSON.stringify(pkg, null, 2))
    for (const name of ['sass', 'node-sass']) {
      await next.patchFile(
        `node_modules/${name}/package.json`,
        JSON.stringify({ name, version: '1.0.0' })
      )
      await next.patchFile(
        `node_modules/${name}/index.js`,
        'module.exports = {}\n'
      )
    }
  })
  ;(isNextStart ? test : test.skip)('duplicate sass deps', async () => {
    const port = await findPort()

    let output = ''
    let child: ChildProcess | undefined
    const exit = next
      .runCommand(['dev', next.testDir, '-p', String(port)], {
        onStdout(msg) {
          output += msg
        },
        onStderr(msg) {
          output += msg
        },
        instance: (p) => {
          child = p
        },
      })
      .catch(() => {})

    try {
      await retry(() => {
        expect(output).toMatch(/both `sass` and `node-sass` installed/)
      })
    } finally {
      if (child) {
        await killApp(child).catch(() => {})
      }
      await exit
    }
  })
})
