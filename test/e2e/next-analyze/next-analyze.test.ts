import { nextTestSetup } from 'e2e-utils'
import { shouldUseTurbopack } from 'next-test-utils'
import path from 'node:path'
import type { ChildProcess } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

async function callMcp(
  mcpUrl: string,
  method: string,
  params: Record<string, unknown>,
  id = 1
): Promise<ReturnType<typeof JSON.parse>> {
  const response = await fetch(mcpUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id }),
  })
  expect(response.status).toBe(200)
  const body = await response.text()
  for (const line of body.split('\n')) {
    if (!line.startsWith('data: ')) continue
    const message = JSON.parse(line.slice('data: '.length))
    if (message.result) {
      expect(message.id).toBe(id)
      return message.result
    }
  }
  throw new Error(`No MCP response: ${body}`)
}

async function callMcpTool(
  mcpUrl: string,
  name: string,
  args: Record<string, unknown>,
  id = 1
): Promise<ReturnType<typeof JSON.parse>> {
  const result = await callMcp(
    mcpUrl,
    'tools/call',
    { name, arguments: args },
    id
  )
  const text = result.content?.find(
    (content: { type: string }) => content.type === 'text'
  )?.text
  if (text) return JSON.parse(text)
  throw new Error(`No MCP tool text response: ${JSON.stringify(result)}`)
}

describe('next experimental-analyze', () => {
  if (!shouldUseTurbopack()) {
    // Test suites require at least one test
    it('skips in non-Turbopack tests', () => {})
    return
  }

  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })

  if (skipped) {
    // Test suites require at least one test
    it('is skipped', () => {})
    return
  }

  it('serves the UI and deterministic MCP queries', async () => {
    let serveProcess: ChildProcess | undefined
    let stdoutBuffer = ''
    let resolveUiUrl!: (url: string) => void
    let resolveMcpUrl!: (url: string) => void
    let rejectUrls!: (err: Error) => void
    const uiUrlPromise = new Promise<string>((resolve, reject) => {
      resolveUiUrl = resolve
      rejectUrls = reject
    })
    const mcpUrlPromise = new Promise<string>((resolve, reject) => {
      resolveMcpUrl = resolve
      rejectUrls = reject
    })

    const timeout = setTimeout(() => {
      rejectUrls(new Error('Analyzer URLs were not printed within timeout'))
    }, 30000)

    const exit = next
      .runCommand(['experimental-analyze', '--port', '0'], {
        onStdout(msg) {
          stdoutBuffer += msg
          const uiMatch = stdoutBuffer.match(
            /Bundle analyzer available at (http:\/\/[^\s]+)/
          )
          const mcpMatch = stdoutBuffer.match(
            /Bundle analyzer MCP available at (http:\/\/[^\s]+\/mcp)/
          )
          if (uiMatch) resolveUiUrl(uiMatch[1])
          if (mcpMatch) resolveMcpUrl(mcpMatch[1])
        },
        instance(p) {
          serveProcess = p
        },
      })
      .finally(() => {
        clearTimeout(timeout)
      })

    try {
      const [uiUrl, mcpUrl] = await Promise.all([uiUrlPromise, mcpUrlPromise])
      expect(new URL(uiUrl).port).toBe(new URL(mcpUrl).port)

      const response = await fetch(uiUrl)
      expect(response.status).toBe(200)
      expect(await response.text()).toContain(
        '<title>Next.js Bundle Analyzer</title>'
      )

      const toolList = await callMcp(mcpUrl, 'tools/list', {})
      expect(toolList.tools.map((tool: { name: string }) => tool.name)).toEqual(
        ['get_bundle_overview']
      )

      const overview = await callMcpTool(mcpUrl, 'get_bundle_overview', {
        routeFilter: 'NOT',
        limit: 1,
      })
      expect(overview).toMatchObject({
        environment: 'total',
        metric: 'raw',
        pagination: { limit: 1, returned: 1 },
      })
      expect(overview.routes[0].route).toBe('/_not-found')
      expect(overview.routes[0].rawSize).toBeGreaterThan(0)
      expect(
        await callMcpTool(mcpUrl, 'get_bundle_overview', {
          routeFilter: 'not',
          limit: 1,
        })
      ).toEqual(overview)

    } finally {
      serveProcess?.kill()
      await exit.catch(() => {})
    }
  })
  ;['-o', '--output'].forEach((flag) => {
    describe(`with ${flag} flag`, () => {
      it('writes output to .next/diagnostics/analyze path', async () => {
        const defaultOutputPath = path.join(
          next.testDir,
          '.next/diagnostics/analyze'
        )

        const { exitCode, stderr, stdout } = await next.runCommand([
          'experimental-analyze',
          flag,
        ])

        expect(exitCode).toBe(0)
        expect(stderr).not.toContain('Error')
        expect(stdout).toContain('.next/diagnostics/analyze')

        expect(existsSync(defaultOutputPath)).toBe(true)
        for (const file of [
          'index.html',
          'data/routes.json',
          'data/modules.data',
          'data/analyze.data',
        ]) {
          expect(existsSync(path.join(defaultOutputPath, file))).toBe(true)
        }

        const routesJson = readFileSync(
          path.join(defaultOutputPath, 'data', 'routes.json'),
          'utf-8'
        )
        const routes = JSON.parse(routesJson)
        expect(routes).toEqual(['/', '/_not-found'])
      })
    })
  })
})
