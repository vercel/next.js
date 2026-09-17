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
            ;(window as any).callWebMcpTool = (name: string, input = {}) =>
              tools.get(name).execute(input)
            ;(window as any).webMcpToolNames = () =>
              [...tools.keys()]
                .filter((name) => name === 'pause_hmr' || name === 'resume_hmr')
                .sort()
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

      async function callHmrTool(name: 'pause_hmr' | 'resume_hmr') {
        const result = await page.evaluate(async (name) => {
          const result = await (window as any).callWebMcpTool(name)
          return {
            ...result,
            snapshot: {
              version: document.querySelector('#version')?.textContent,
              counter: document.querySelector('#counter')?.textContent,
            },
          }
        }, name)
        expect(result.structuredContent).toEqual(expect.any(Object))
        expect(result.content[0]).toEqual({
          type: 'text',
          text: expect.any(String),
        })
        return result
      }

      async function inspectStatus() {
        const result = await page.evaluate(() =>
          (window as any).callWebMcpTool('nextjs_inspect', { view: 'status' })
        )
        expect(result.isError).not.toBe(true)
        return result.structuredContent
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
        expect(
          (await callHmrTool('resume_hmr')).structuredContent
        ).toMatchObject({
          outcome: 'no-op',
          updatesApplied: false,
          reload: 'none',
          errors: [],
          status: {
            hmrState: 'idle',
            pendingUpdates: 0,
            pageStatus: 'current',
          },
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
        for (let attempt = 0; attempt < 2; attempt++) {
          expect(
            (await callHmrTool('pause_hmr')).structuredContent
          ).toMatchObject({
            outcome: 'paused',
            status: { hmrState: 'paused' },
          })
        }
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

        // Resume acknowledges revisions observed by this document. Wait for
        // the final build before asserting its DOM on the first read.
        await patchAndWaitForBuild(
          original.replace('version-1', 'version-2'),
          false
        )
        const resumed = await callHmrTool('resume_hmr')
        expect(resumed.isError).not.toBe(true)
        expect(resumed.structuredContent).toMatchObject({
          outcome: 'applied',
          updatesApplied: true,
          reload: 'none',
          errors: [],
          observedRevision: expect.any(Number),
          status: {
            hmrState: 'idle',
            pendingUpdates: 0,
            compilationState: 'ready',
            pageStatus: 'current',
          },
        })
        // Check the first read after the tool resolves, without retry masking
        // an acknowledgement delivered before React commits the update.
        expect(resumed.snapshot.version).toBe('version-2')
        expect(resumed.snapshot.counter).toBe('Count: 2')
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
          const resumedOtherTab = await callHmrTool('resume_hmr')
          expect(resumedOtherTab.structuredContent).toMatchObject({
            outcome: 'applied',
            updatesApplied: true,
          })
          expect(resumedOtherTab.snapshot.version).toBe('version-3')
        } finally {
          await otherTab.close()
        }
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
        expect(
          (await callHmrTool('resume_hmr')).structuredContent
        ).toMatchObject({
          outcome: 'reload-required',
          updatesApplied: false,
          reload: 'scheduled',
        })
        await retry(async () => {
          expect(await browser.elementById('counter').text()).toBe('Count: 0')
        })

        // A broken final edit must still be visible after resuming.
        await browser.eval('window.callWebMcpTool("pause_hmr")')
        await patchAndWaitForBuild(original + '\nconst broken = ;\n', true)
        const started = Date.now()
        const blocked = await callHmrTool('resume_hmr')
        expect(Date.now() - started).toBeLessThan(15_000)
        expect(blocked.isError).toBe(true)
        expect(blocked.structuredContent).toMatchObject({
          outcome: 'blocked',
          updatesApplied: false,
          reload: 'none',
          errors: expect.arrayContaining([
            expect.objectContaining({ message: expect.any(String) }),
          ]),
          status: {
            hmrState: 'idle',
            compilationState: 'error',
            pageStatus: 'stale',
            errors: blocked.structuredContent.errors,
          },
        })
        // A completed, blocked update must not keep reporting active work.
        // Inspect separately to cover callers that query after tool completion.
        expect(await inspectStatus()).toMatchObject({
          hmrState: 'idle',
          compilationState: 'error',
          pageStatus: 'stale',
          errors: blocked.structuredContent.errors,
        })
        await waitForRedbox(browser)
        await next.patchFile('counter.tsx', original)
        await waitForNoRedbox(browser)
        expect(await browser.elementById('version').text()).toBe('version-1')
        expect(
          (await callHmrTool('resume_hmr')).structuredContent
        ).toMatchObject({
          outcome: 'no-op',
          errors: [],
          status: {
            hmrState: 'idle',
            pendingUpdates: 0,
            compilationState: 'ready',
            pageStatus: 'current',
          },
        })
        expect(await inspectStatus()).toMatchObject({
          hmrState: 'idle',
          compilationState: 'ready',
          pageStatus: 'current',
          errors: [],
        })
      } finally {
        await browser.close()
        await next.patchFile('counter.tsx', original)
      }
    })
  }
})
