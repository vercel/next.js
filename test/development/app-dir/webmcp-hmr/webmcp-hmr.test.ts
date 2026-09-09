import { nextTestSetup } from 'e2e-utils'
import { retry, waitForNoRedbox, waitForRedbox } from 'next-test-utils'

describe('webmcp-hmr', () => {
  const { next } = nextTestSetup({ files: __dirname, forcedPort: 'random' })

  for (const [route, api] of [
    ['/', 'document'],
    ['/legacy', 'navigator'],
  ] as const) {
    it(`holds broken edits until resume on ${route}`, async () => {
      const original = await next.readFile('counter.tsx')
      const builds: { errors?: unknown[] }[] = []
      let connections = 0
      // The test runner's Chromium does not necessarily implement WebMCP.
      // Capture actual tool registrations without replacing HMR logic.
      const browser = await next.browser(route, {
        beforePageLoad: async (page) => {
          page.on('websocket', (socket) => {
            socket.on('framereceived', ({ payload }) => {
              if (typeof payload !== 'string') return
              const message = JSON.parse(payload)
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
        await retry(async () => {
          expect(await browser.eval('window.webMcpToolNames()')).toEqual([
            'pause_hmr',
            'resume_hmr',
          ])
        })
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
        expect(await browser.elementById('counter').text()).toBe('Count: 0')

        // Normal HMR must continue after the catch-up reload.
        await next.patchFile(
          'counter.tsx',
          original.replace('version-1', 'version-3')
        )
        await retry(async () => {
          expect(await browser.elementById('version').text()).toBe('version-3')
        })

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
        expect(await browser.elementById('counter').text()).toBe('Count: 1')
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
      } finally {
        await browser.close()
        await next.patchFile('counter.tsx', original)
      }
    })
  }
})
