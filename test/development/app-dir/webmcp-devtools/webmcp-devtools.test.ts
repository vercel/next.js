import { nextTestSetup } from 'e2e-utils'
import { gate, retry, waitForNoRedbox } from 'next-test-utils'
import type { Page } from 'playwright'
import { readFile } from 'node:fs/promises'

type ToolResult = {
  content: { type: string; text: string }[]
  isError?: boolean
}

type Tool = {
  name: string
  annotations?: { readOnlyHint?: boolean }
  execute: (input: Record<string, unknown>) => Promise<ToolResult>
}

type TestWindow = typeof window & { devTools: Record<string, Tool> }

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
  return page.evaluate(
    async ({ name, input }) => {
      const result = await (window as TestWindow).devTools[name].execute(input)
      return {
        ...result,
        data:
          name === 'pause_hmr' || name === 'resume_hmr'
            ? result.content[0].text
            : JSON.parse(result.content[0].text),
      }
    },
    { name, input }
  )
}

async function inspect(page: Page, view: string, input = {}) {
  const result = await callTool(page, 'nextjs_inspect', { view, ...input })
  expect(result.isError).not.toBe(true)
  return result.data
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
    await callTool(page, 'pause_hmr')
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
      expect(await page.locator('#version').textContent()).toBe('version-1')
      await callTool(page, 'resume_hmr')
      await retry(async () => {
        expect(await page.locator('#version').textContent()).toBe('version-2')
        expect(await page.locator('#counter').textContent()).toBe('Count: 1')
      })
      await waitForNoRedbox(browser)
    } finally {
      await next.patchFile('app/unvisited/page.tsx', originalRoute)
      await next.patchFile('app/counter.tsx', originalCounter)
      await callTool(page, 'resume_hmr')
    }
  })
})
