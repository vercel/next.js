import { nextTestSetup } from 'e2e-utils'
import { shouldUseTurbopack } from 'next-test-utils'
import path from 'node:path'
import type { ChildProcess } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

type RouteEntry = {
  route_entry_id: string
  module_ident: string
  role: 'route' | 'shared'
  entry_kind?: 'server' | 'client_bootstrap'
  client_references?: Array<{
    module_ident: string
    module_path: string
    reference_kind: 'ecmascript' | 'css'
  }>
}

function readAnalyzeHeader<T>(filename: string): T {
  const buffer = readFileSync(filename)
  const jsonLength = buffer.readUInt32BE(0)
  return JSON.parse(buffer.subarray(4, 4 + jsonLength).toString('utf8')) as T
}

describe('next analyze', () => {
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

  it('runs successfully without errors', async () => {
    let serveProcess: ChildProcess | undefined
    let stdoutBuffer = ''
    let resolveUrl!: (url: string) => void
    let rejectUrl!: (err: Error) => void
    const urlPromise = new Promise<string>((resolve, reject) => {
      resolveUrl = resolve
      rejectUrl = reject
    })

    const timeout = setTimeout(() => {
      rejectUrl(new Error('Server did not start within timeout'))
    }, 30000)

    const exit = next
      .runCommand(['analyze', '--port', '0'], {
        onStdout(msg) {
          stdoutBuffer += msg
          const urlMatch = stdoutBuffer.match(/http:\/\/[^\s]+/)
          if (urlMatch) {
            resolveUrl(urlMatch[0])
          }
        },
        instance(p) {
          serveProcess = p
        },
      })
      .finally(() => {
        clearTimeout(timeout)
      })

    try {
      const url = await urlPromise
      const response = await fetch(url)
      expect(response.status).toBe(200)
      expect(await response.text()).toContain(
        '<title>Next.js Bundle Analyzer</title>'
      )
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
          'analyze',
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
        expect([...routes].sort()).toEqual(
          ['/', '/_not-found', '/api/ping', '/legacy'].sort()
        )

        const dataDir = path.join(defaultOutputPath, 'data')
        const { modules } = readAnalyzeHeader<{
          modules: Array<{ ident: string }>
        }>(path.join(dataDir, 'modules.data'))
        const moduleIdents = new Set(modules.map((module) => module.ident))
        const { route_entries: appEntries } = readAnalyzeHeader<{
          route_entries: RouteEntry[]
        }>(path.join(dataDir, 'analyze.data'))
        const { route_entries: pagesEntries } = readAnalyzeHeader<{
          route_entries: RouteEntry[]
        }>(path.join(dataDir, 'legacy', 'analyze.data'))
        const { route_entries: apiEntries } = readAnalyzeHeader<{
          route_entries: RouteEntry[]
        }>(path.join(dataDir, 'api', 'ping', 'analyze.data'))

        expect(appEntries.some((entry) => entry.entry_kind === 'server')).toBe(
          true
        )
        expect(
          appEntries.some((entry) => entry.entry_kind === 'client_bootstrap')
        ).toBe(true)
        const clientReferences = appEntries.flatMap(
          (entry) => entry.client_references ?? []
        )
        expect(
          clientReferences.some((reference) =>
            reference.module_path.includes('client-entry')
          )
        ).toBe(true)
        expect(
          clientReferences.some(
            (reference) => reference.reference_kind === 'css'
          )
        ).toBe(true)
        const rootIdents = new Set(
          appEntries.map((entry) => entry.module_ident)
        )
        for (const reference of clientReferences) {
          expect(rootIdents.has(reference.module_ident)).toBe(false)
          expect(moduleIdents.has(reference.module_ident)).toBe(true)
          expect(['ecmascript', 'css']).toContain(reference.reference_kind)
        }
        expect(
          pagesEntries.some((entry) => entry.entry_kind === 'client_bootstrap')
        ).toBe(true)
        expect(pagesEntries.some((entry) => entry.role === 'shared')).toBe(true)
        expect(apiEntries.some((entry) => entry.entry_kind === 'server')).toBe(
          true
        )
        expect(
          apiEntries.some((entry) => entry.entry_kind === 'client_bootstrap')
        ).toBe(false)
        expect(
          apiEntries.every((entry) => !entry.client_references?.length)
        ).toBe(true)
        for (const entry of [...appEntries, ...pagesEntries, ...apiEntries]) {
          expect(moduleIdents.has(entry.module_ident)).toBe(true)
          expect(entry).not.toHaveProperty('initial')
          expect(entry).not.toHaveProperty('load_scope')
        }
      })
    })
  })
})
