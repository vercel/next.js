import { nextTestSetup } from 'e2e-utils'
import { gate, retry, waitForNoRedbox, waitForRedbox } from 'next-test-utils'
import type { Page } from 'playwright'
import { createServer, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

describe('webmcp-hmr', () => {
  const { next } = nextTestSetup({ files: __dirname, forcedPort: 'random' })

  for (const [route, api] of [
    ['/', 'document'],
    ['/legacy', 'navigator'],
  ] as const) {
    it(`handles HMR tools on ${route}`, async () => {
      const original = await next.readFile('counter.tsx')
      const builds: { errors?: unknown[] }[] = []
      let connections = 0
      let building = false
      let page: Page
      // The test runner's Chromium does not necessarily implement WebMCP.
      // Capture actual tool registrations without replacing HMR logic.
      const browser = await next.browser(route, {
        beforePageLoad: async (browserPage) => {
          page = browserPage
          page.on('websocket', (socket) => {
            socket.on('framereceived', ({ payload }) => {
              if (typeof payload !== 'string') return
              const message = JSON.parse(payload)
              if (message.type === 'building') building = true
              if (message.type === 'built') building = false
              if (message.type === 'built') builds.push(message)
              if (
                message.type === 'turbopack-connected' ||
                message.type === 'sync'
              )
                connections++
            })
          })
          await page.addInitScript((api) => {
            const tools = new Map()
            Object.defineProperty(
              api === 'document' ? document : navigator,
              'modelContext',
              {
                configurable: true,
                value:
                  api === 'document'
                    ? {
                        registerTool: async (tool, { signal }) => {
                          tools.set(tool.name, tool)
                          signal.addEventListener('abort', () =>
                            tools.delete(tool.name)
                          )
                        },
                      }
                    : {
                        registerTool: (tool) => tools.set(tool.name, tool),
                        unregisterTool: (name) => tools.delete(name),
                      },
              }
            )
            ;(window as any).callWebMcpTool = (name: string) =>
              tools.get(name).execute({})
            ;(window as any).webMcpToolNames = () => [...tools.keys()].sort()
          }, api)
        },
      })

      async function patchAndWaitForBuild(content: string, hasErrors: boolean) {
        const offset = builds.length
        await next.patchFile('counter.tsx', content)
        // Observe the real socket without applying updates or requesting a
        // render of an intermediate broken version on the server.
        await retry(async () => {
          expect(
            builds
              .slice(offset)
              .some((build) => Boolean(build.errors?.length) === hasErrors)
          ).toBe(true)
        })
      }

      try {
        if (!(await gate((c) => c.turbopack))) {
          // Webpack cannot merge intermediate module factories before applying
          // them. Do not advertise controls that cannot preserve normal HMR.
          await browser.elementById('counter').click()
          await next.patchFile(
            'counter.tsx',
            original.replace('version-1', 'version-2')
          )
          await retry(async () => {
            expect(await browser.elementById('version').text()).toBe(
              'version-2'
            )
          })
          expect(await browser.eval('window.webMcpToolNames()')).toEqual([])
          expect(await browser.elementById('counter').text()).toBe('Count: 1')
          await waitForNoRedbox(browser)
          return
        }
        await retry(async () => {
          expect(await browser.eval('window.webMcpToolNames()')).toEqual([
            'pause_hmr',
            'resume_hmr',
          ])
        })

        // Hold a real compilation open and ensure pause cannot acknowledge it
        // until both compilation and the resulting module update have finished.
        let released = false
        const responses: ServerResponse[] = []
        const compilationGate = createServer((_req, res) => {
          if (released) res.end()
          else responses.push(res)
        })
        const release = () => {
          released = true
          for (const response of responses) response.end()
        }
        await new Promise<void>((resolve) =>
          compilationGate.listen(0, '127.0.0.1', resolve)
        )
        try {
          const { port } = compilationGate.address() as AddressInfo
          await next.patchFile(
            'counter.tsx',
            original.replace('Ready to edit', 'Compilation finished') +
              `\n// compile-gate: http://127.0.0.1:${port}\n`
          )
          await retry(async () => {
            expect(responses.length).toBeGreaterThan(0)
            expect(building).toBe(true)
          })
          await browser.eval(`
            window.pausePending = true
            window.pauseResult = window.callWebMcpTool('pause_hmr').then(() => {
              window.pausePending = false
            })
            void 0
          `)
          expect(await browser.eval('window.pausePending')).toBe(true)
          release()
          await browser.eval('window.pauseResult')
          expect(building).toBe(false)
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe(
              'Compilation finished'
            )
          })
        } finally {
          release()
          await new Promise<void>((resolve) =>
            compilationGate.close(() => resolve())
          )
        }

        await browser.eval('window.hmrDocument = true')
        await browser.elementById('counter').click()
        await browser.eval('window.callWebMcpTool("pause_hmr")')
        await browser.eval('window.callWebMcpTool("pause_hmr")')
        await patchAndWaitForBuild(original + '\nconst broken = ;\n', true)
        await waitForNoRedbox(browser)
        expect(await browser.elementById('version').text()).toBe('version-1')
        await browser.elementById('counter').click()
        expect(await browser.elementById('counter').text()).toBe('Count: 2')

        // Valid syntax can still throw during module evaluation. Resume must
        // not replay this intermediate version either.
        await patchAndWaitForBuild(
          original + '\nthrow new Error("intermediate edit")\n',
          false
        )
        await waitForNoRedbox(browser)
        expect(await browser.elementById('version').text()).toBe('version-1')

        // Resume immediately after writing the final source, even if the
        // compiler has not finished rebuilding it yet.
        await next.patchFile(
          'counter.tsx',
          original.replace('version-1', 'version-2')
        )
        await browser.eval('window.callWebMcpTool("resume_hmr")')
        await retry(async () => {
          expect(await browser.elementById('version').text()).toBe('version-2')
        })
        await waitForNoRedbox(browser)
        expect(await browser.elementById('counter').text()).toBe('Count: 2')
        expect(await browser.eval('window.hmrDocument')).toBe(true)

        // Pausing one tab must not hold updates in another tab.
        const otherTab = await page!.context().newPage()
        try {
          await otherTab.goto(next.url + route)
          await browser.eval('window.callWebMcpTool("pause_hmr")')
          await patchAndWaitForBuild(
            original.replace('version-1', 'version-3'),
            false
          )
          await retry(async () => {
            expect(await otherTab.locator('#version').textContent()).toBe(
              'version-3'
            )
          })
          expect(await browser.elementById('version').text()).toBe('version-2')
          await browser.eval('window.callWebMcpTool("resume_hmr")')
        } finally {
          await otherTab.close()
        }
        await retry(async () => {
          expect(await browser.elementById('version').text()).toBe('version-3')
        })
        expect(await browser.elementById('counter').text()).toBe('Count: 2')

        // Reconnect to a restarted server without losing the paused page.
        await browser.elementById('counter').click()
        await browser.eval('window.callWebMcpTool("pause_hmr")')
        const previousConnections = connections
        await next.stop()
        await next.start()
        expect(await next.render(route)).toContain('version-3')
        await retry(async () => {
          expect(connections).toBeGreaterThan(previousConnections)
        })
        expect(await browser.elementById('counter').text()).toBe('Count: 3')
        await waitForNoRedbox(browser)
        await browser.eval('window.callWebMcpTool("resume_hmr")')
        await retry(async () => {
          expect(await browser.elementById('counter').text()).toBe('Count: 0')
        })

        // A broken final edit must still be visible after resuming.
        await browser.eval('window.callWebMcpTool("pause_hmr")')
        await patchAndWaitForBuild(original + '\nconst broken = ;\n', true)
        await browser.eval('window.callWebMcpTool("resume_hmr")')
        await waitForRedbox(browser)
        await next.patchFile('counter.tsx', original)
        await waitForNoRedbox(browser)
        expect(await browser.elementById('version').text()).toBe('version-1')
      } finally {
        await browser.close()
        await next.patchFile('counter.tsx', original)
      }
    })
  }
})
