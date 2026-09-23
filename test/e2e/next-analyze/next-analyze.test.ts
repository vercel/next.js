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

type EdgesReference = { offset: number; length: number }

type ChunkGraphHeader = {
  schema_version: number
  module_index_hash: string
  output_files: Array<{ filename: string }>
  output_file_modules: EdgesReference
  output_file_module_coverage: Array<'exact' | 'unsupported' | 'not_a_chunk'>
  unresolved_output_references: number[]
  chunk_groups: Array<{
    id: number
    kind: 'bootstrap' | 'render_dependent' | 'async' | 'worker'
    trigger_module_index?: number
    output_file_indices: number[]
  }>
  chunk_load_edges: Array<{
    source_output_file_index: number
    target_output_file_index: number
    kind: string
    trigger_module_index?: number
  }>
  unjoined_chunk_load_edges: Array<{ kind: string; reason: string }>
  unjoined_modules: Array<{
    output_file_index: number
    module_ident: string
    reason: string
  }>
}

function readAnalyzeFile<T>(filename: string) {
  const buffer = readFileSync(filename)
  const jsonLength = buffer.readUInt32BE(0)
  const binaryStart = 4 + jsonLength
  expect(binaryStart).toBeLessThanOrEqual(buffer.length)
  return {
    header: JSON.parse(buffer.subarray(4, binaryStart).toString('utf8')) as T,
    binary: buffer.subarray(binaryStart),
  }
}

function readAnalyzeHeader<T>(filename: string): T {
  return readAnalyzeFile<T>(filename).header
}

function assertNumericJoinSafe(
  route: { schema_version?: number; module_index_hash?: string },
  modules: { schema_version?: number; module_index_hash?: string }
): boolean {
  if (
    route.schema_version === undefined &&
    modules.schema_version === undefined
  ) {
    return false // legacy headers remain decodable, but have no numeric cross-file join
  }
  if (
    route.schema_version !== 1 ||
    modules.schema_version !== 1 ||
    !route.module_index_hash ||
    route.module_index_hash !== modules.module_index_hash
  ) {
    throw new Error('Unsupported version or mismatched module index snapshot')
  }
  return true
}

function readRows(binary: Buffer, reference: EdgesReference): number[][] {
  const { offset, length } = reference
  expect(offset + length).toBeLessThanOrEqual(binary.length)
  const section = binary.subarray(offset, offset + length)
  const count = section.readUInt32BE(0)
  const offsets = Array.from({ length: count }, (_, i) =>
    section.readUInt32BE(4 + 4 * i)
  )
  const total = offsets.at(-1) ?? 0
  expect(section.length).toBe(4 * (1 + count + total))
  let start = 0
  return offsets.map((end) => {
    expect(end).toBeGreaterThanOrEqual(start)
    const row = Array.from({ length: end - start }, (_, i) =>
      section.readUInt32BE(4 * (1 + count + start + i))
    )
    start = end
    return row
  })
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
      .runCommand(['experimental-analyze', '--port', '0'], {
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
  it('does not join legacy or mismatched module indices', () => {
    expect(assertNumericJoinSafe({}, {})).toBe(false)
    expect(() =>
      assertNumericJoinSafe({ schema_version: 1, module_index_hash: 'a' }, {})
    ).toThrow()
    expect(() =>
      assertNumericJoinSafe(
        { schema_version: 2, module_index_hash: 'a' },
        { schema_version: 2, module_index_hash: 'a' }
      )
    ).toThrow()
    expect(() =>
      assertNumericJoinSafe(
        { schema_version: 1, module_index_hash: 'a' },
        { schema_version: 1, module_index_hash: 'b' }
      )
    ).toThrow()
    expect(
      assertNumericJoinSafe(
        { schema_version: 1, module_index_hash: 'a' },
        { schema_version: 1, module_index_hash: 'a' }
      )
    ).toBe(true)
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
        expect([...routes].sort()).toEqual(
          ['/', '/_not-found', '/api/ping', '/legacy'].sort()
        )

        const dataDir = path.join(defaultOutputPath, 'data')
        const {
          modules,
          schema_version: modulesVersion,
          module_index_hash: moduleIndexHash,
        } = readAnalyzeHeader<{
          schema_version: number
          module_index_hash: string
          modules: Array<{ ident: string }>
        }>(path.join(dataDir, 'modules.data'))
        expect(moduleIndexHash).toMatch(/^[0-9a-f]{16}$/)
        expect(modulesVersion).toBe(1)
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

        const routeGraphs = [
          'analyze.data',
          'legacy/analyze.data',
          'api/ping/analyze.data',
        ].map((route) =>
          readAnalyzeFile<ChunkGraphHeader>(path.join(dataDir, route))
        )
        for (const { header, binary } of routeGraphs) {
          expect(header.schema_version).toBe(modulesVersion)
          expect(header.module_index_hash).toBe(moduleIndexHash)
          expect(
            assertNumericJoinSafe(header, {
              schema_version: modulesVersion,
              module_index_hash: moduleIndexHash,
            })
          ).toBe(true)
          expect(header.unresolved_output_references).toHaveLength(
            header.output_files.length
          )
          expect(header.output_file_module_coverage).toHaveLength(
            header.output_files.length
          )
          const rows = readRows(binary, header.output_file_modules)
          expect(rows).toHaveLength(header.output_files.length)
          for (const [i, row] of rows.entries()) {
            if (header.output_file_module_coverage[i] === 'not_a_chunk') {
              expect(row).toEqual([])
            }
            for (const index of row) {
              expect(index).toBeLessThan(modules.length)
              expect(moduleIdents.has(modules[index].ident)).toBe(true)
            }
          }
          for (const group of header.chunk_groups) {
            for (const index of group.output_file_indices) {
              expect(index).toBeLessThan(header.output_files.length)
            }
          }
          const edgeKeys = header.chunk_load_edges.map((edge) =>
            JSON.stringify(edge)
          )
          expect(new Set(edgeKeys).size).toBe(edgeKeys.length)
          expect(header.chunk_groups.map((group) => group.id)).toEqual(
            header.chunk_groups.map((_, index) => index)
          )
          for (const edge of header.chunk_load_edges) {
            expect(edge.source_output_file_index).toBeLessThan(
              header.output_files.length
            )
            expect(edge.target_output_file_index).toBeLessThan(
              header.output_files.length
            )
          }
          expect(header).not.toHaveProperty('initial')
          expect(header).not.toHaveProperty('prefetched')
        }
        const appGraph = routeGraphs[0].header
        const pagesGraph = routeGraphs[1].header
        const apiGraph = routeGraphs[2].header
        expect(
          appGraph.chunk_groups.some((group) => group.kind === 'bootstrap')
        ).toBe(true)
        expect(
          appGraph.chunk_groups.some(
            (group) => group.kind === 'render_dependent'
          )
        ).toBe(true)
        expect(
          appGraph.chunk_groups.some((group) => group.kind === 'worker')
        ).toBe(true)
        expect(
          pagesGraph.chunk_groups.some((group) => group.kind === 'bootstrap')
        ).toBe(true)
        expect(
          apiGraph.chunk_groups.some((group) => group.kind === 'bootstrap')
        ).toBe(false)
        expect(
          appGraph.chunk_groups.some((group) => group.kind === 'async')
        ).toBe(true)
        expect(
          appGraph.chunk_load_edges.some((edge) => edge.kind === 'async')
        ).toBe(true)
        expect(
          appGraph.chunk_load_edges.some(
            (edge) => edge.kind === 'worker_registration'
          )
        ).toBe(true)
        expect(
          appGraph.unjoined_modules.some(
            (module) =>
              module.reason === 'worker_compiled_in_separate_graph' &&
              module.module_ident.includes('/pwa')
          )
        ).toBe(true)
        const appRows = readRows(
          routeGraphs[0].binary,
          appGraph.output_file_modules
        )
        expect(
          appRows.some((row) =>
            row.some((index) => modules[index].ident.includes('client-entry'))
          )
        ).toBe(true)
        expect(
          appRows.some((row) =>
            row.some((index) => modules[index].ident.includes('/lazy'))
          )
        ).toBe(true)
        expect(appGraph.output_file_module_coverage).toContain('exact')
        const groupedFileIndices = appGraph.chunk_groups.flatMap(
          (group) => group.output_file_indices
        )
        expect(new Set(groupedFileIndices).size).toBeLessThan(
          groupedFileIndices.length
        )
        for (const index of appGraph.chunk_groups
          .filter((group) => group.kind === 'worker')
          .flatMap((group) => group.output_file_indices)) {
          expect(appGraph.output_file_module_coverage[index]).toBe(
            'unsupported'
          )
          expect(appRows[index]).toEqual([])
        }
        expect(
          appRows.some(
            (row, index) =>
              appGraph.output_files[index].filename.endsWith('.css') &&
              row.some((module) => modules[module].ident.includes('page.css'))
          )
        ).toBe(true)
        expect(
          appGraph.chunk_groups.some(
            (group) =>
              group.kind === 'render_dependent' &&
              group.output_file_indices.some((index) =>
                appRows[index].some((module) =>
                  modules[module].ident.includes('client-entry')
                )
              )
          )
        ).toBe(true)
        expect(
          appGraph.chunk_load_edges.some(
            (edge) =>
              edge.kind === 'async' &&
              appRows[edge.target_output_file_index].some((module) =>
                modules[module].ident.includes('/lazy')
              )
          )
        ).toBe(true)
        expect(
          appGraph.chunk_load_edges.some(
            (edge) =>
              edge.kind === 'worker_registration' &&
              appRows[edge.source_output_file_index].some((module) =>
                modules[module].ident.includes('client-entry')
              ) &&
              appGraph.output_files[
                edge.target_output_file_index
              ].filename.includes('service-worker/sw.js')
          )
        ).toBe(true)
        expect(
          pagesGraph.chunk_groups.filter((group) => group.kind === 'bootstrap')
            .length
        ).toBeGreaterThanOrEqual(2)
        expect(
          appGraph.unjoined_chunk_load_edges.every(
            (edge) => edge.kind !== 'worker_registration'
          )
        ).toBe(true)
      })
    })
  })
})
