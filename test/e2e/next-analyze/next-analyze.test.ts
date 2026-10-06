import { nextTestSetup } from 'e2e-utils'
import {
  decodeBuildSelection,
  encodeBuildSelection,
  snapshotBaseDir,
} from '../../../apps/bundle-analyzer/lib/snapshot'
import { validateGraphDump } from '../../lib/analyze-graph-schema'
import { shouldUseTurbopack } from 'next-test-utils'
import path from 'node:path'
import type { ChildProcess } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

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
  output_file_async_loaders: EdgesReference
  output_file_module_coverage: Array<'exact' | 'unsupported' | 'not_a_chunk'>
  chunk_groups: Array<{
    id: number
    kind: 'bootstrap' | 'render_dependent' | 'async' | 'worker'
    trigger_module_index?: number
    output_file_indices: number[]
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

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// It likely inspects local build artifacts that deploy tests do not expose.
// @force-gate !deploy
describe('next analyze', () => {
  if (!shouldUseTurbopack()) {
    // Test suites require at least one test
    it('skips in non-Turbopack tests', () => {})
    return
  }

  const { next } = nextTestSetup({ files: __dirname, skipStart: true })

  it('distinguishes saved names from live-build URL selections', () => {
    expect(decodeBuildSelection(null)).toBeUndefined()
    expect(decodeBuildSelection('latest')).toBeNull()
    expect(decodeBuildSelection('snapshot:')).toBeUndefined()
    expect(decodeBuildSelection('untagged-name')).toBeUndefined()
    for (const name of [
      'latest',
      'snapshot:latest',
      'server / preview',
      '東京 % #',
    ]) {
      const params = new URLSearchParams({
        from: encodeBuildSelection(name),
        to: encodeBuildSelection(null),
      })
      const parsed = new URLSearchParams(params.toString())
      expect(decodeBuildSelection(parsed.get('from'))).toBe(name)
      expect(decodeBuildSelection(parsed.get('to'))).toBeNull()
      expect(snapshotBaseDir({ name, createdAt: '', routeCount: 0 })).toBe(
        `/history/${encodeURIComponent(`snapshot-${encodeURIComponent(name)}`)}`
      )
    }
  })

  it('serves the analyzer and safely encoded named history', async () => {
    const name = 'server / preview'
    let serveProcess: ChildProcess | undefined
    let stdoutBuffer = ''
    let resolveUrl!: (url: string) => void
    let rejectUrl!: (err: Error) => void
    const urlPromise = new Promise<string>((resolve, reject) => {
      resolveUrl = resolve
      rejectUrl = reject
    })
    const timeout = setTimeout(
      () => rejectUrl(new Error('Analyzer server did not start')),
      30000
    )
    const exit = next
      .runCommand(['analyze', '--port', '0', '--snapshot', name], {
        onStdout(msg) {
          stdoutBuffer += msg
          const match = stdoutBuffer.match(/http:\/\/[^\s]+/)
          if (match) resolveUrl(match[0])
        },
        instance(p) {
          serveProcess = p
        },
      })
      .then(
        (result) => {
          rejectUrl(
            new Error(
              `Analyzer exited before startup: ${result.stderr}\n${result.stdout}`
            )
          )
          return result
        },
        (error) => {
          rejectUrl(error)
          throw error
        }
      )
      .finally(() => clearTimeout(timeout))
    try {
      const url = await urlPromise
      const response = await fetch(url)
      expect(response.status).toBe(200)
      expect(await response.text()).toContain(
        '<title>Next.js Bundle Analyzer</title>'
      )
      const saved = await fetch(
        `${url}/history/${encodeURIComponent(`snapshot-${encodeURIComponent(name)}`)}/metadata.json`
      )
      expect(saved.status).toBe(200)
      expect(await saved.json()).toMatchObject({ name })
    } finally {
      serveProcess?.kill()
      await exit.catch(() => {})
    }
  })

  it('captures, replaces and streams a named snapshot without building on replay', async () => {
    const exportHelp = await next.runCommand(['analyze', 'export', '--help'])
    expect(exportHelp.exitCode).toBe(0)
    expect(exportHelp.stdout).toContain(
      'as JSON Lines without building or serving.'
    )
    const name = 'JSON snapshot'
    const captureArgs = ['analyze', '--output', '--snapshot', name]
    const fresh = await next.runCommand(captureArgs)
    expect(fresh).toMatchObject({ exitCode: 0 })
    expect(fresh.stdout).toContain('Analyzing a production build')
    const analyzeDir = path.join(next.testDir, '.next/diagnostics/analyze')
    const snapshotDir = path.join(
      analyzeDir,
      'history',
      `snapshot-${encodeURIComponent(name)}`
    )
    const metadata = JSON.parse(
      readFileSync(path.join(analyzeDir, 'data/metadata.json'), 'utf8')
    )
    expect(metadata.name).toBe(name)
    expect(metadata).not.toHaveProperty('id')
    expect(metadata).not.toHaveProperty('snapshotName')
    expect(
      JSON.parse(readFileSync(path.join(snapshotDir, 'metadata.json'), 'utf8'))
    ).toEqual(metadata)

    const staleFile = path.join(snapshotDir, 'stale-output.js')
    writeFileSync(staleFile, 'old capture')
    const replacement = await next.runCommand(captureArgs)
    expect(replacement).toMatchObject({ exitCode: 0 })
    expect(existsSync(staleFile)).toBe(false)
    const history = JSON.parse(
      readFileSync(path.join(analyzeDir, 'history/history.json'), 'utf8')
    )
    expect(
      history.snapshots.filter(
        (snapshot: { name: string }) => snapshot.name === name
      )
    ).toHaveLength(1)
    expect(history.snapshots[0].name).toBe(name)
    expect(history.snapshots[0].createdAt > metadata.createdAt).toBe(true)
    expect(existsSync(path.join(snapshotDir, 'graph.jsonl'))).toBe(false)

    const named = await next.runCommand(
      ['analyze', 'export', next.testDir, '--snapshot', name],
      { env: { PORT: '39555' } }
    )
    // An inherited PORT must not make saved-data replay start a server.
    expect(named).toMatchObject({ exitCode: 0 })
    validateGraphDump(named.stdout)
    expect(named.stderr).not.toContain('Analyzing a production build')
    const records = named.stdout
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
    expect(records[0]).toMatchObject({
      type: 'meta',
      schema_version: 1,
      snapshot_name: name,
    })
    expect(records[0]).not.toHaveProperty('snapshot_id')
    for (const type of ['module', 'part', 'output', 'route']) {
      expect(records.some((record) => record.type === type)).toBe(true)
    }
    for (const record of records)
      expect(record).not.toHaveProperty('route_index')
    const latest = await next.runCommand(['analyze', 'export'])
    expect(latest.exitCode).toBe(0)
    expect(latest.stdout).toBe(named.stdout)
    const alias = await next.runCommand([
      'experimental-analyze',
      'export',
      '--snapshot',
      name,
    ])
    expect(alias.exitCode).toBe(0)
    expect(alias.stdout).toBe(named.stdout)
    const outputRecords = records.filter(
      (record) => record.type === 'output' && record.route === '/'
    )
    for (const output of records.filter((record) => record.type === 'output')) {
      expect(output.modules).toEqual([...output.modules].sort())
      expect(output.async_loaders).toEqual([...output.async_loaders].sort())
    }

    const clientEntries = records.filter(
      (record) =>
        record.type === 'module' &&
        record.path.endsWith('/app/client-entry.tsx') &&
        record.ident.includes('[app-client]')
    )
    const asyncTargets = records.filter(
      (record) =>
        record.type === 'module' &&
        record.ident.includes('[app-client]') &&
        (record.path.endsWith('/app/async-target.ts') ||
          record.path.endsWith('/app/dynamic-target.tsx'))
    )
    expect(clientEntries.length).toBeGreaterThan(0)
    expect(
      asyncTargets.some((record) =>
        record.path.endsWith('/app/async-target.ts')
      )
    ).toBe(true)
    expect(
      asyncTargets.some(
        (record) =>
          record.path.endsWith('/app/dynamic-target.tsx') &&
          record.ident.includes('next/dynamic entry')
      )
    ).toBe(true)
    const asyncDependencies = clientEntries.flatMap(
      (record) => record.dependencies.async
    )
    for (const target of asyncTargets) {
      // The import graph records the target, not a synthetic loader module.
      if (
        target.ident.includes('next/dynamic entry') ||
        target.path.endsWith('/app/async-target.ts')
      ) {
        expect(asyncDependencies).toContain(target.ident)
      }
    }
    const importerOutputs = outputRecords.filter((record) =>
      clientEntries.some((entry) => record.modules.includes(entry.ident))
    )
    expect(importerOutputs.length).toBeGreaterThan(0)
    for (const target of asyncTargets.filter(
      (target) =>
        target.ident.includes('next/dynamic entry') ||
        target.path.endsWith('/app/async-target.ts')
    )) {
      expect(
        importerOutputs.some((output) =>
          output.async_loaders.includes(target.ident)
        )
      ).toBe(true)
    }

    for (const target of asyncTargets) {
      expect(
        outputRecords.some((output) => output.modules.includes(target.ident))
      ).toBe(true)
    }

    for (const output of importerOutputs) {
      expect(output.coverage).toBe('exact')
      // Joining a loader's target must not attribute that target to the importer.
      for (const target of asyncTargets) {
        expect(output.modules).not.toContain(target.ident)
      }
    }
    expect(
      outputRecords
        .flatMap((record) => record.modules)
        .some((ident: string) => ident.endsWith('async loader)'))
    ).toBe(false)

    const modulesByIdent = new Map(
      records
        .filter((record) => record.type === 'module')
        .map((record) => [record.ident, record])
    )
    const allAsyncDependencies = new Set(
      [...modulesByIdent.values()].flatMap(
        (module) => module.dependencies.async
      )
    )
    const asyncGroups = records.filter(
      (record) => record.type === 'group' && record.kind === 'async'
    )
    for (const group of records.filter(
      (record) =>
        record.type === 'group' &&
        (record.kind === 'async' || record.kind === 'worker')
    )) {
      expect(group.trigger_join).toBe('joined')
      expect(
        records.some(
          (output) =>
            output.type === 'output' &&
            output.route === group.route &&
            output[
              group.kind === 'async' ? 'async_loaders' : 'modules'
            ].includes(group.trigger_module_ident)
        )
      ).toBe(true)
    }
    expect(asyncGroups.length).toBeGreaterThan(0)
    for (const record of asyncGroups) {
      expect(record.trigger_join).toBe('joined')
      const target = modulesByIdent.get(record.trigger_module_ident)
      expect(target).toBeDefined()
      expect(record.trigger_module_ident).toBe(target.ident)
      expect(allAsyncDependencies.has(target.ident)).toBe(true)
    }
    const expectedTargets = [
      ...asyncTargets.filter(
        (target) =>
          target.ident.includes('next/dynamic entry') ||
          target.path.endsWith('/app/async-target.ts')
      ),
      ...[...modulesByIdent.values()].filter(
        (module) =>
          module.path.endsWith('/app/lazy.ts') &&
          module.ident.includes('[app-client]')
      ),
      ...[...modulesByIdent.values()].filter(
        (module) =>
          module.ident.includes('node:os') &&
          module.ident.includes('[external]')
      ),
    ]
    expect(
      expectedTargets.some((target) => target.path.endsWith('/app/lazy.ts'))
    ).toBe(true)
    expect(
      expectedTargets.some((target) => target.ident.includes('node:os'))
    ).toBe(true)
    for (const target of expectedTargets) {
      expect(allAsyncDependencies.has(target.ident)).toBe(true)
      expect(
        asyncGroups.some((group) => group.trigger_module_ident === target.ident)
      ).toBe(true)
    }

    const filtered = await next.runCommand([
      'analyze',
      'export',
      '--snapshot',
      name,
      '--route',
      '/',
    ])
    expect(filtered.exitCode).toBe(0)
    validateGraphDump(filtered.stdout)
    const filteredRecords = filtered.stdout
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
    expect(filteredRecords[0]).toMatchObject({
      route_count: records[0].route_count,
      selected_routes: 1,
    })
    expect(
      filteredRecords.filter((record) => record.type === 'module')
    ).toEqual(records.filter((record) => record.type === 'module'))
    expect(filteredRecords.filter((record) => record.type === 'route')).toEqual(
      records.filter(
        (record) => record.type === 'route' && record.route === '/'
      )
    )

    // One-route-at-a-time export can leave a valid prefix when a later route fails.
    const routeRecords = records.filter((record) => record.type === 'route')
    expect(routeRecords.length).toBeGreaterThan(1)
    const lastRoute = routeRecords[routeRecords.length - 1].route
    const lastRouteFile = path.join(
      snapshotDir,
      lastRoute.slice(1),
      'analyze.data'
    )
    const originalRoute = readFileSync(lastRouteFile)
    try {
      writeFileSync(lastRouteFile, originalRoute.subarray(0, 3))
      const failed = await next.runCommand([
        'analyze',
        'export',
        '--snapshot',
        name,
      ])
      expect(failed.exitCode).not.toBe(0)
      expect(failed.stderr).toContain('Truncated analyzer header')
      const partial = failed.stdout
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line))
      const lastRouteIndex = records.findIndex(
        (record) => record.type === 'route' && record.route === lastRoute
      )
      expect(partial).toEqual(records.slice(0, lastRouteIndex))
      expect(partial.some((record) => record.type === 'route')).toBe(true)
      expect(partial.some((record) => record.route === lastRoute)).toBe(false)
    } finally {
      writeFileSync(lastRouteFile, originalRoute)
    }
    const restored = await next.runCommand([
      'analyze',
      'export',
      '--snapshot',
      name,
    ])
    expect(restored.exitCode).toBe(0)
    expect(restored.stdout).toBe(named.stdout)

    const moduleFile = path.join(snapshotDir, 'modules.data')
    const originalModules = readFileSync(moduleFile)
    try {
      writeFileSync(moduleFile, originalModules.subarray(0, 3))
      const truncated = await next.runCommand([
        'analyze',
        'export',
        '--snapshot',
        name,
      ])
      expect(truncated.exitCode).not.toBe(0)
      expect(truncated.stdout).toBe('')
      expect(truncated.stderr).toContain('Truncated analyzer header')
    } finally {
      writeFileSync(moduleFile, originalModules)
    }

    const routeFile = path.join(snapshotDir, 'analyze.data')
    const routeOriginal = readFileSync(routeFile)
    try {
      const oldHeaderLength = routeOriginal.readUInt32BE(0)
      const header = JSON.parse(
        routeOriginal.toString('utf8', 4, 4 + oldHeaderLength)
      )
      const altered = Buffer.from(
        JSON.stringify({ ...header, module_index_hash: 'wrong' })
      )
      const length = Buffer.alloc(4)
      length.writeUInt32BE(altered.length)
      writeFileSync(
        routeFile,
        Buffer.concat([
          length,
          altered,
          routeOriginal.subarray(4 + oldHeaderLength),
        ])
      )
      const mismatch = await next.runCommand([
        'analyze',
        'export',
        '--snapshot',
        name,
      ])
      expect(mismatch.exitCode).not.toBe(0)
      const partial = mismatch.stdout
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line))
      expect(partial[0]).toMatchObject({ type: 'meta', snapshot_name: name })
      expect(partial.some((record) => record.type === 'module')).toBe(true)
      expect(partial.some((record) => record.route === '/')).toBe(false)
      expect(mismatch.stderr).toContain('module-index fingerprint mismatch')
    } finally {
      writeFileSync(routeFile, routeOriginal)
    }
  }, 120_000)

  it('replays a snapshot created by next build --analyze', async () => {
    const build = await next.runCommand(['build', '--analyze'])
    if (build.exitCode !== 0)
      throw new Error(
        `next build --analyze failed: ${build.stderr}\n${build.stdout}`
      )
    const analyzeDir = path.join(next.testDir, '.next/diagnostics/analyze')
    const history = JSON.parse(
      readFileSync(path.join(analyzeDir, 'history/history.json'), 'utf8')
    )
    const name = history.snapshots[0].name
    const replay = await next.runCommand([
      'analyze',
      'export',
      '--snapshot',
      name,
    ])
    expect(replay).toMatchObject({ exitCode: 0 })
    validateGraphDump(replay.stdout)
    expect(JSON.parse(replay.stdout.split('\n')[0])).toMatchObject({
      type: 'meta',
      snapshot_name: name,
    })
    expect(replay.stderr).not.toContain('Analyzing a production build')
  }, 120_000)
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
          ...(flag === '--output' ? ['.'] : []),
        ])
        expect({ exitCode, stderr, stdout }).toMatchObject({ exitCode: 0 })
        expect(stderr).not.toContain('Error')
        expect(stdout).toContain('.next/diagnostics/analyze')
        for (const file of [
          'index.html',
          'data/routes.json',
          'data/route-summaries.json',
          'data/modules.data',
          'data/analyze.data',
        ]) {
          expect(existsSync(path.join(defaultOutputPath, file))).toBe(true)
        }
        const routes = JSON.parse(
          readFileSync(path.join(defaultOutputPath, 'data/routes.json'), 'utf8')
        )
        expect([...routes].sort()).toEqual(
          ['/', '/_not-found', '/api/ping', '/legacy'].sort()
        )
        const routeSummaries = JSON.parse(
          readFileSync(
            path.join(defaultOutputPath, 'data/route-summaries.json'),
            'utf8'
          )
        )
        expect(
          routeSummaries.map((summary: { route: string }) => summary.route)
        ).toEqual(expect.arrayContaining(routes))
        for (const summary of routeSummaries) {
          expect(Number.isFinite(summary.size)).toBe(true)
          expect(summary.size).toBeGreaterThanOrEqual(0)
          expect(Number.isFinite(summary.compressed_size)).toBe(true)
          expect(summary.compressed_size).toBeGreaterThanOrEqual(0)
          // Recompute the canary summary from the same parts, including shared/traced assets.
          const analyzeBuffer = readFileSync(
            path.join(
              defaultOutputPath,
              'data',
              summary.route.replace(/^\//, ''),
              'analyze.data'
            )
          )
          const header = JSON.parse(
            analyzeBuffer
              .subarray(4, 4 + analyzeBuffer.readUInt32BE(0))
              .toString('utf8')
          ) as {
            output_files: { filename: string }[]
            chunk_parts: {
              output_file_index: number
              size: number
              compressed_size: number
            }[]
          }
          const totals = {
            size: 0,
            compressed_size: 0,
            client: { size: 0, compressed_size: 0 },
          }
          for (const part of header.chunk_parts) {
            totals.size += part.size
            totals.compressed_size += part.compressed_size
            if (
              header.output_files[part.output_file_index].filename.startsWith(
                '[client-fs]/'
              )
            ) {
              totals.client.size += part.size
              totals.client.compressed_size += part.compressed_size
            }
          }
          expect(summary).toMatchObject(totals)
          expect(
            header.output_files.some(({ filename }) =>
              /\.(?:map|nft\.json)$/.test(filename)
            )
          ).toBe(false)
        }
        const history = JSON.parse(
          readFileSync(
            path.join(defaultOutputPath, 'history/history.json'),
            'utf8'
          )
        )
        const snapshotRouteSummaries = readFileSync(
          path.join(
            defaultOutputPath,
            'history',
            `snapshot-${encodeURIComponent(history.snapshots[0].name)}`,
            'route-summaries.json'
          ),
          'utf8'
        )
        expect(JSON.parse(snapshotRouteSummaries)).toEqual(routeSummaries)
        const generatedNames = history.snapshots.map(
          (snapshot: { name: string }) => snapshot.name
        )
        expect(new Set(generatedNames).size).toBe(generatedNames.length)

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
        const routeRoots = appEntries.filter(
          (entry) => entry.role === 'route' && entry.entry_kind === 'server'
        )
        expect(routeRoots).toHaveLength(2)
        expect(
          new Set(routeRoots.map((entry) => entry.route_entry_id)).size
        ).toBe(2)
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
          expect(entry).not.toHaveProperty('runtime')
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
          const rows = readRows(binary, header.output_file_modules)
          for (const [i, row] of rows.entries()) {
            if (header.output_file_module_coverage[i] === 'not_a_chunk') {
              expect(row).toEqual([])
            }
          }
          for (const group of header.chunk_groups) {
            if (group.kind === 'worker') {
              expect(group.trigger_module_index).toBeDefined()
              expect(
                rows.some((row) => row.includes(group.trigger_module_index!))
              ).toBe(true)
            }
          }
        }
        expect(
          routeGraphs.some(({ header, binary }) => {
            const rows = readRows(binary, header.output_file_modules)
            return header.output_files.some(
              (output, i) =>
                output.filename.includes('/server/chunks/') &&
                output.filename.endsWith('.js') &&
                header.output_file_module_coverage[i] === 'exact' &&
                rows[i].length > 0
            )
          })
        ).toBe(true)
        const runtimeOutputs = routeGraphs.flatMap(({ header }) =>
          header.output_files.flatMap((output, i) =>
            output.filename.includes('[turbopack]_runtime')
              ? [header.output_file_module_coverage[i]]
              : []
          )
        )
        expect(runtimeOutputs.length).toBeGreaterThan(0)
        expect(
          runtimeOutputs.every((coverage) => coverage === 'not_a_chunk')
        ).toBe(true)
        const workers = routeGraphs.flatMap(({ header }) =>
          header.output_files.flatMap((output, index) =>
            output.filename.includes('/service-worker/')
              ? [header.output_file_module_coverage[index]]
              : []
          )
        )
        expect(workers.length).toBeGreaterThan(0)
        expect(workers.every((coverage) => coverage === 'not_a_chunk')).toBe(
          true
        )
        const appGraph = routeGraphs[0].header
        const pagesGraph = routeGraphs[1].header
        const apiGraph = routeGraphs[2].header
        const sharedAppGraph = readAnalyzeHeader<ChunkGraphHeader>(
          path.join(dataDir, '_app/analyze.data')
        )
        expect(
          sharedAppGraph.chunk_groups.filter(
            (group) => group.kind === 'bootstrap'
          )
        ).toHaveLength(1)
        const documentGraph = readAnalyzeHeader<ChunkGraphHeader>(
          path.join(dataDir, '_document/analyze.data')
        )
        expect(documentGraph.chunk_groups).toEqual([])

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
            'not_a_chunk'
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
          pagesGraph.chunk_groups.filter((group) => group.kind === 'bootstrap')
            .length
        ).toBeGreaterThanOrEqual(2)
      })
    })
  })
})
