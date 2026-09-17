import { nextTestSetup } from 'e2e-utils'
import { gate, retry, waitForNoRedbox } from 'next-test-utils'
import type { Page } from 'playwright'
import { readFile } from 'node:fs/promises'
import { createServer, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

type ToolResult = {
  content: { type: string; text: string }[]
  structuredContent: Record<string, any>
  isError?: boolean
}

type Tool = {
  name: string
  annotations?: { readOnlyHint?: boolean }
  execute: (input: Record<string, unknown>) => Promise<ToolResult>
}

type TestWindow = typeof window & {
  devTools: Record<string, Tool>
  resumePending: boolean
  resumeResult: Promise<{
    result: ToolResult
    snapshot: { heading: string; counter: string; color: string }
  }>
}

async function installWebMCP(page: Page) {
  // Capture actual runtime registrations while the test browser lacks WebMCP.
  // Document registrations are asynchronous and owned by their AbortSignal.
  await page.addInitScript(() => {
    const testWindow = window as TestWindow
    testWindow.devTools = {}
    Object.defineProperty(document, 'modelContext', {
      configurable: true,
      value: {
        async registerTool(tool: Tool, { signal }: { signal: AbortSignal }) {
          if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
          if (testWindow.devTools[tool.name]) {
            throw new Error('A tool with this name already exists')
          }
          testWindow.devTools[tool.name] = tool
          signal.addEventListener(
            'abort',
            () => {
              if (testWindow.devTools[tool.name] === tool) {
                delete testWindow.devTools[tool.name]
              }
            },
            { once: true }
          )
        },
      },
    })
  })
}

async function callTool(
  page: Page,
  name: string,
  input: Record<string, unknown> = {}
) {
  const result = await page.evaluate(
    async ({ name, input }) => {
      const result = await (window as TestWindow).devTools[name].execute(input)
      return {
        ...result,
        // Capture in the same browser task that resumes after execution, so
        // the test does not give HMR another round trip to finish rendering.
        snapshot: {
          version: document.querySelector('#version')?.textContent,
          counter: document.querySelector('#counter')?.textContent,
        },
      }
    },
    { name, input }
  )
  expect(result.structuredContent).toEqual(expect.any(Object))
  expect(result.content[0]).toEqual({
    type: 'text',
    text: expect.any(String),
  })
  return { ...result, data: result.structuredContent }
}

async function inspect(page: Page, view: string, input = {}) {
  const result = await callTool(page, 'nextjs_inspect', { view, ...input })
  expect(result.isError).not.toBe(true)
  return result.data
}

async function startResume(page: Page) {
  await page.evaluate(() => {
    const testWindow = window as TestWindow
    testWindow.resumePending = true
    testWindow.resumeResult = testWindow.devTools.resume_hmr
      .execute({})
      .then((result) => {
        testWindow.resumePending = false
        return {
          result,
          snapshot: {
            heading: document.querySelector('h1').textContent,
            counter: document.querySelector('#counter').textContent,
            color: getComputedStyle(document.querySelector('#version')).color,
          },
        }
      })
  })
}

describe('webmcp-devtools', () => {
  const { next } = nextTestSetup({ files: __dirname })

  async function openBrowser(route = '/') {
    let page: Page
    const browser = await next.browser(`/tools${route}`, {
      beforePageLoad: async (browserPage) => {
        page = browserPage
        await installWebMCP(page)
      },
    })
    await retry(async () => {
      expect(
        await page.evaluate(() => Object.keys((window as TestWindow).devTools))
      ).toContain('nextjs_inspect')
    })
    return { browser, page }
  }

  it('advertises capabilities and routes without enabling the server MCP endpoint', async () => {
    const { page } = await openBrowser()
    const turbopack = await gate((c) => c.turbopack)
    await retry(async () => {
      expect(
        await page.evaluate(() =>
          Object.keys((window as TestWindow).devTools).sort()
        )
      ).toEqual(
        turbopack
          ? [
              'nextjs_compile_route',
              'nextjs_inspect',
              'pause_hmr',
              'resume_hmr',
            ]
          : ['nextjs_inspect']
      )
    })
    expect(await inspect(page, 'project')).toMatchObject({
      projectPath: next.testDir,
      devServerUrl: expect.stringContaining(new URL(next.url).port),
      bundler: turbopack ? 'turbopack' : 'webpack',
      capabilities: {
        compilation: turbopack,
        compileRoute: turbopack,
        requestInsights: true,
      },
    })
    expect(await inspect(page, 'routes')).toEqual({
      appRouter: expect.arrayContaining(['/', '/other', '/unvisited']),
      pagesRouter: ['/legacy'],
    })
    expect(await inspect(page, 'routes', { routerType: 'pages' })).toEqual({
      pagesRouter: ['/legacy'],
    })
    expect(
      await page.evaluate(
        () =>
          (window as TestWindow).devTools.nextjs_inspect.annotations
            ?.readOnlyHint
      )
    ).toBe(true)
    expect(
      (await next.fetch('/tools/_next/mcp', { method: 'POST' })).status
    ).toBe(404)
    await retry(async () => {
      expect(await inspect(page, 'status')).toMatchObject({
        hmrState: turbopack ? 'idle' : 'unavailable',
        pendingUpdates: 0,
        compilationState: 'ready',
        pageStatus: turbopack ? 'current' : 'unknown',
        errors: [],
      })
    })
  })

  it('returns only the invoking document page, errors, and request insights', async () => {
    const { page } = await openBrowser('/?private=query#fragment')
    const otherPage = await page.context().newPage()
    await installWebMCP(otherPage)
    try {
      await otherPage.goto(`${next.url}/tools/other?private=other#fragment`)
      await retry(async () => {
        const home = await inspect(page, 'page')
        const other = await inspect(otherPage, 'page')
        expect(home.sessions).toHaveLength(1)
        expect(home.sessions[0]).toMatchObject({
          url: '/tools',
          routerType: 'app',
          segments: expect.arrayContaining([
            expect.objectContaining({ path: 'app/page.tsx' }),
          ]),
        })
        expect(other.sessions).toHaveLength(1)
        expect(other.sessions[0]).toMatchObject({
          url: '/tools/other',
          routerType: 'app',
          segments: expect.arrayContaining([
            expect.objectContaining({ path: 'app/other/page.tsx' }),
          ]),
        })
      })

      await retry(async () => {
        const homeRequests = (await inspect(page, 'requests')).requests
        const otherRequests = (await inspect(otherPage, 'requests')).requests
        expect(homeRequests.length).toBeGreaterThan(0)
        expect(otherRequests.length).toBeGreaterThan(0)
        const homeId = await page.evaluate(() => (self as any).__next_r)
        const otherId = await otherPage.evaluate(() => (self as any).__next_r)
        expect(homeId).not.toBe(otherId)
        expect(
          homeRequests.every((request) => request.htmlRequestId === homeId)
        ).toBe(true)
        expect(
          otherRequests.every((request) => request.htmlRequestId === otherId)
        ).toBe(true)
        expect(
          (
            await inspect(page, 'requests', {
              requestId: otherRequests[0].requestId,
            })
          ).requests
        ).toEqual([])
      })

      await otherPage.locator('#break-page').click()
      await retry(async () => {
        expect(await inspect(page, 'errors')).toEqual({
          configErrors: [],
          sessionErrors: [],
        })
        const errors = await inspect(otherPage, 'errors')
        expect(errors.sessionErrors).toHaveLength(1)
        expect(errors.sessionErrors[0]).toMatchObject({
          url: '/tools/other',
          buildError: null,
          runtimeErrors: expect.arrayContaining([
            expect.objectContaining({
              message: 'Only the other document failed',
              stack: expect.arrayContaining([
                expect.objectContaining({
                  file: expect.stringContaining('app/other/page.tsx'),
                  methodName: 'OtherPage',
                  line: expect.any(Number),
                }),
              ]),
            }),
          ]),
        })
      })
    } finally {
      await otherPage.close()
    }
  })

  it('supports Pages Router metadata and reports unavailable request context', async () => {
    const { page } = await openBrowser('/legacy')
    await retry(async () => {
      const metadata = await inspect(page, 'page')
      expect(metadata.sessions).toHaveLength(1)
      expect(metadata.sessions[0]).toMatchObject({
        url: '/tools/legacy',
        routerType: 'pages',
      })
    })
    const requests = await callTool(page, 'nextjs_inspect', {
      view: 'requests',
    })
    expect(requests.isError).toBe(true)
    expect(requests.data.error).toEqual(expect.any(String))
  })

  it('provides log location and server action source through the same browser tool', async () => {
    const { page } = await openBrowser()
    const logs = await inspect(page, 'logs')
    expect(logs.logFilePath).toContain('next-development.log')
    await page.evaluate(() => console.log('webmcp-browser-log-marker'))
    await retry(async () => {
      expect(await readFile(logs.logFilePath, 'utf8')).toContain(
        'webmcp-browser-log-marker'
      )
    })
    const actionId = await page
      .locator('input[name^="$ACTION_ID_"]')
      .getAttribute('name')
    expect(actionId).toBeTruthy()
    expect(
      await inspect(page, 'server-action', {
        actionId: actionId.slice('$ACTION_ID_'.length),
      })
    ).toMatchObject({
      actionId: actionId.slice('$ACTION_ID_'.length),
      runtime: 'node',
      filename: expect.stringContaining('app/actions.ts'),
      functionName: 'saveAction',
    })
  })

  it('rejects malformed or cross-origin development context requests', async () => {
    const endpoint = '/tools/_next/devtools'
    expect((await next.fetch(endpoint)).status).toBe(405)
    expect(
      (await next.fetch(endpoint, { method: 'POST', body: 'not JSON' })).status
    ).toBe(415)
    for (const body of [
      { type: 'inspect', input: { view: 'unknown' } },
      { type: 'compile-route', input: {} },
      { type: 'compile-route', input: { path: '/', routeSpecifier: '/' } },
      {
        type: 'inspect',
        input: { view: 'requests', htmlRequestId: 'another-tab' },
      },
    ]) {
      const response = await next.fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: expect.any(String) })
    }
    const blocked = await next.fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://unrelated.example',
      },
      body: JSON.stringify({ type: 'inspect', input: { view: 'project' } }),
    })
    expect(blocked.status).toBe(403)
  })

  it('checks an unvisited route while HMR is paused and resumes the finished edit', async () => {
    const { browser, page } = await openBrowser()
    if (!(await gate((c) => c.turbopack))) {
      const compilation = await callTool(page, 'nextjs_inspect', {
        view: 'compilation',
      })
      expect(compilation.isError).toBe(true)
      expect(compilation.data.error).toContain('Turbopack')
      return
    }

    const originalRoute = await next.readFile('app/unvisited/page.tsx')
    const originalCounter = await next.readFile('app/counter.tsx')
    await page.locator('#counter').click()
    expect((await callTool(page, 'pause_hmr')).data).toMatchObject({
      outcome: 'paused',
      status: { hmrState: 'paused' },
    })
    try {
      await next.patchFile(
        'app/unvisited/page.tsx',
        originalRoute + '\nconst broken = ;\n'
      )
      const broken = await callTool(page, 'nextjs_compile_route', {
        path: '/unvisited',
      })
      expect(broken.isError).not.toBe(true)
      expect(broken.data).toMatchObject({
        routeSpecifier: '/unvisited',
        issues: expect.arrayContaining([
          expect.objectContaining({
            filePath: expect.stringContaining('app/unvisited/page.tsx'),
          }),
        ]),
      })
      expect((await inspect(page, 'compilation')).issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            filePath: expect.stringContaining('app/unvisited/page.tsx'),
          }),
        ])
      )
      expect(await page.locator('#version').textContent()).toBe('version-1')
      await waitForNoRedbox(browser)

      await next.patchFile('app/unvisited/page.tsx', originalRoute)
      await next.patchFile(
        'app/counter.tsx',
        originalCounter.replace('version-1', 'version-2')
      )
      await retry(async () => {
        const fixed = await callTool(page, 'nextjs_compile_route', {
          routeSpecifier: '/unvisited',
        })
        expect(fixed.data).toEqual({ routeSpecifier: '/unvisited', issues: [] })
      })
      await retry(async () => {
        const status = await inspect(page, 'status')
        expect(status).toMatchObject({
          hmrState: 'paused',
          compilationState: 'ready',
          pageStatus: 'stale',
        })
        expect(status.pendingUpdates).toBeGreaterThan(0)
      })
      expect(await page.locator('#version').textContent()).toBe('version-1')
      const resumed = await callTool(page, 'resume_hmr')
      expect(resumed.isError).not.toBe(true)
      expect(resumed.data).toMatchObject({
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
      // The first DOM read after resume must observe the completed update.
      // Polling here would hide an acknowledgement that arrives too early.
      expect(resumed.snapshot.version).toBe('version-2')
      expect(resumed.snapshot.counter).toBe('Count: 1')
      expect(await inspect(page, 'status')).toMatchObject({
        hmrState: 'idle',
        pendingUpdates: 0,
        pageStatus: 'current',
      })
      expect((await callTool(page, 'resume_hmr')).data).toMatchObject({
        outcome: 'no-op',
        updatesApplied: false,
        reload: 'none',
        errors: [],
      })
      await waitForNoRedbox(browser)
    } finally {
      await next.patchFile('app/unvisited/page.tsx', originalRoute)
      await next.patchFile('app/counter.tsx', originalCounter)
      await callTool(page, 'resume_hmr')
    }
  })

  it('waits for an updated stylesheet to load before acknowledging resume', async () => {
    const { browser, page } = await openBrowser()
    const turbopack = await gate((c) => c.turbopack)
    const original = await next.readFile('app/style.css')
    let release: () => void
    const stylesheetGate = new Promise<void>((resolve) => {
      release = resolve
    })
    const requests: string[] = []
    const stylesheetPattern = /\/_next\/static\/.*\.css(?:\?|$)/

    try {
      await page.locator('#counter').click()
      expect(
        await page
          .locator('#version')
          .evaluate((element) => getComputedStyle(element).color)
      ).toBe('rgb(180, 30, 30)')
      await page.route(stylesheetPattern, async (route) => {
        const response = await route.fetch()
        requests.push(route.request().url())
        await stylesheetGate
        await route.fulfill({ response })
      })
      if (turbopack) await callTool(page, 'pause_hmr')
      await next.patchFile(
        'app/style.css',
        original.replace('rgb(180, 30, 30)', 'rgb(20, 90, 200)')
      )
      if (turbopack) {
        await retry(async () => {
          const status = await inspect(page, 'status')
          expect(status).toMatchObject({
            hmrState: 'paused',
            compilationState: 'ready',
            pageStatus: 'stale',
          })
          expect(status.pendingUpdates).toBeGreaterThan(0)
        })
        await startResume(page)
      }
      await retry(async () => {
        expect(requests.length).toBeGreaterThan(0)
      })
      if (turbopack) {
        expect(await inspect(page, 'status')).toMatchObject({
          hmrState: 'applying',
          pageStatus: 'updating',
        })
        expect(
          await page.evaluate(() => (window as TestWindow).resumePending)
        ).toBe(true)
      }
      expect(
        await page
          .locator('#version')
          .evaluate((element) => getComputedStyle(element).color)
      ).toBe('rgb(180, 30, 30)')
      release()

      if (turbopack) {
        const completed = await page.evaluate(
          () => (window as TestWindow).resumeResult
        )
        expect(completed.result.structuredContent).toMatchObject({
          outcome: 'applied',
          updatesApplied: true,
          errors: [],
          status: { hmrState: 'idle', pageStatus: 'current' },
        })
        expect(completed.snapshot).toMatchObject({
          color: 'rgb(20, 90, 200)',
          counter: 'Count: 1',
        })
      } else {
        // Webpack keeps ordinary HMR and explicitly reports controls unavailable.
        await retry(async () => {
          expect(
            await page
              .locator('#version')
              .evaluate((element) => getComputedStyle(element).color)
          ).toBe('rgb(20, 90, 200)')
        })
        expect(await page.locator('#counter').textContent()).toBe('Count: 1')
        expect(await inspect(page, 'status')).toMatchObject({
          hmrState: 'unavailable',
        })
      }
    } finally {
      release()
      await page.unrouteAll({ behavior: 'wait' })
      await browser.close()
      await next.patchFile('app/style.css', original)
    }
  })

  it('waits for a slow server component refresh to commit before acknowledging resume', async () => {
    const { browser, page } = await openBrowser()
    const turbopack = await gate((c) => c.turbopack)
    const original = await next.readFile('app/page.tsx')
    const responses: ServerResponse[] = []
    let released = false
    const renderGate = createServer((_request, response) => {
      if (released) response.end('ready')
      else responses.push(response)
    })
    const release = () => {
      released = true
      for (const response of responses) response.end('ready')
    }
    await new Promise<void>((resolve) =>
      renderGate.listen(0, '127.0.0.1', resolve)
    )

    try {
      await page.locator('#counter').click()
      if (turbopack) await callTool(page, 'pause_hmr')
      const { port } = renderGate.address() as AddressInfo
      await next.patchFile(
        'app/page.tsx',
        original
          .replace('function Page()', 'async function Page()')
          .replace(
            '  return (',
            `  await fetch('http://127.0.0.1:${port}', { cache: 'no-store' })\n  return (`
          )
          .replace('Browser development tools', 'Server render finished')
      )
      if (turbopack) {
        await retry(async () => {
          const status = await inspect(page, 'status')
          expect(status).toMatchObject({
            hmrState: 'paused',
            compilationState: 'ready',
            pageStatus: 'stale',
          })
          expect(status.pendingUpdates).toBeGreaterThan(0)
        })
        await startResume(page)
      }
      await retry(async () => {
        expect(responses.length).toBeGreaterThan(0)
      })
      if (turbopack) {
        expect(await inspect(page, 'status')).toMatchObject({
          hmrState: 'applying',
          pageStatus: 'updating',
        })
        expect(
          await page.evaluate(() => (window as TestWindow).resumePending)
        ).toBe(true)
      }
      expect(await page.locator('h1').textContent()).toBe(
        'Browser development tools'
      )
      release()

      if (turbopack) {
        const completed = await page.evaluate(
          () => (window as TestWindow).resumeResult
        )
        expect(completed.result.structuredContent).toMatchObject({
          outcome: 'applied',
          updatesApplied: true,
          errors: [],
          status: { hmrState: 'idle', pageStatus: 'current' },
        })
        expect(completed.snapshot).toMatchObject({
          heading: 'Server render finished',
          counter: 'Count: 1',
        })
      } else {
        await retry(async () => {
          expect(await page.locator('h1').textContent()).toBe(
            'Server render finished'
          )
        })
        expect(await page.locator('#counter').textContent()).toBe('Count: 1')
        expect(await inspect(page, 'status')).toMatchObject({
          hmrState: 'unavailable',
        })
      }
    } finally {
      release()
      await browser.close()
      await next.patchFile('app/page.tsx', original)
      await new Promise<void>((resolve) => renderGate.close(() => resolve()))
    }
  })
})
