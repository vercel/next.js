import { nextTestSetup } from 'e2e-utils'
import { check, fetchViaHTTP, findPort } from 'next-test-utils'
import http from 'http'
import path from 'path'

const describeCase = (
  caseName: string,
  callback: (context: ReturnType<typeof nextTestSetup>) => void
) => {
  describe(caseName, () => {
    const context = nextTestSetup({
      files: path.join(__dirname, caseName),
      skipDeployment: true,
    })
    if (context.skipped) return

    callback(context)
  })
}
describe('Instrumentation Hook', () => {
  describeCase('with-esm-import', ({ next }) => {
    it('with-esm-import should run the instrumentation hook', async () => {
      await next.render('/')
      await check(
        () => next.cliOutput,
        /register in instrumentation\.js is running/
      )
    })
  })

  describeCase('with-middleware', ({ next }) => {
    it('with-middleware should run the instrumentation hook', async () => {
      await next.render('/')
      await check(() => next.cliOutput, /instrumentation hook on the edge/)
    })
  })

  describeCase('with-edge-api', ({ next }) => {
    it('with-edge-api should run the instrumentation hook', async () => {
      await next.render('/api')
      await check(() => next.cliOutput, /instrumentation hook on the edge/)
    })
  })

  describeCase('with-edge-page', ({ next }) => {
    it('with-edge-page should run the instrumentation hook', async () => {
      await next.render('/')
      await check(() => next.cliOutput, /instrumentation hook on the edge/)
    })
  })

  describeCase('with-node-api', ({ next }) => {
    it('with-node-api should run the instrumentation hook', async () => {
      await check(() => next.cliOutput, /instrumentation hook on nodejs/)
    })
  })

  describeCase('with-node-page', ({ next }) => {
    it('with-node-page should run the instrumentation hook', async () => {
      await check(() => next.cliOutput, /instrumentation hook on nodejs/)
    })
  })

  describeCase('with-async-node-page', ({ next }) => {
    it('with-async-node-page should run the instrumentation hook', async () => {
      const page = await next.render('/')
      expect(page).toContain('Node - finished: true')
    })
  })

  describeCase('with-async-edge-page', ({ next }) => {
    it('with-async-edge-page should run the instrumentation hook', async () => {
      const page = await next.render('/')
      expect(page).toContain('Edge - finished: true')
    })
  })

  describeCase('with-async-node-app-route', ({ next, isNextStart }) => {
    it('with-async-node-app-route should run the instrumentation hook before the app-route handler', async () => {
      const res = await next.fetch('/api/check')
      const body = await res.json()
      expect(body).toEqual({ finished: true })
    })

    if (isNextStart) {
      it('with-async-node-app-route should wait for instrumentation when invoking the app-route handler directly', async () => {
        const routeModulePath = path.join(
          next.testDir,
          '.next',
          'server',
          'app',
          'api',
          'check',
          'route.js'
        )
        const previousCwd = process.cwd()
        const port = await findPort()
        let server: http.Server | undefined
        let handlerError: unknown

        try {
          process.chdir(next.testDir)

          const { handler } = require(routeModulePath) as {
            handler: (
              req: http.IncomingMessage,
              res: http.ServerResponse,
              ctx: {
                requestMeta?: Record<string, unknown>
                waitUntil?: (promise: Promise<void>) => void
              }
            ) => Promise<void>
          }

          server = http.createServer(async (req, res) => {
            try {
              await handler(req, res, {
                waitUntil: () => {},
                requestMeta: {
                  initURL: `https://localhost:${port}${req.url ?? '/'}`,
                  distDir: path.join(next.testDir, '.next'),
                  minimalMode: true,
                  relativeProjectDir: '.',
                },
              })
            } catch (error) {
              handlerError = error

              if (!res.writableEnded) {
                if (!res.headersSent) {
                  res.statusCode = 500
                }
                res.end()
              }
            }
          })

          await new Promise<void>((resolve, reject) => {
            server.listen(port, () => {
              resolve()
            })
            server.once('error', reject)
          })

          const res = await fetchViaHTTP(port, '/api/check')
          const body = await res.json()

          expect(res.status).toBe(200)
          expect(body).toEqual({ finished: true })
          expect(handlerError).toBeUndefined()
        } finally {
          process.chdir(previousCwd)

          if (server) {
            await new Promise<void>((resolve, reject) => {
              server.close((error) => {
                if (error) {
                  reject(error)
                  return
                }

                resolve()
              })
            })
          }
        }
      })
    }
  })

  describeCase('general', ({ next, isNextDev }) => {
    it('should not overlap with a instrumentation page', async () => {
      const page = await next.render('/instrumentation')
      expect(page).toContain('Hello')
    })
    if (isNextDev) {
      // TODO: Implement handling for changing the instrument file.
      it.skip('should reload the server when the instrumentation hook changes', async () => {
        await next.render('/')
        await next.patchFile(
          './instrumentation.js',
          `export function register() {console.log('toast')}`
        )
        await check(() => next.cliOutput, /toast/)
        await next.renameFile(
          './instrumentation.js',
          './instrumentation.js.bak'
        )
        await check(
          () => next.cliOutput,
          /The instrumentation file has been removed/
        )
        await next.patchFile(
          './instrumentation.js.bak',
          `export function register() {console.log('bread')}`
        )
        await next.renameFile(
          './instrumentation.js.bak',
          './instrumentation.js'
        )
        await check(() => next.cliOutput, /The instrumentation file was added/)
        await check(() => next.cliOutput, /bread/)
      })
    }
  })
})
