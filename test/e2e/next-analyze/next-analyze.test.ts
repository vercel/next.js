import { nextTestSetup } from 'e2e-utils'
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

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// It likely inspects local build artifacts that deploy tests do not expose.
// @force-gate !deploy
describe('next analyze', () => {
  if (!shouldUseTurbopack()) {
    // Test suites require at least one test
    it('skips in non-Turbopack tests', () => {})
    return
  }

  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('runs successfully without errors', async () => {
    const captureHelp = await next.runCommand(['analyze', '--help'])
    expect(captureHelp.exitCode).toBe(0)
    expect(captureHelp.stdout).toContain('export')
    expect(captureHelp.stdout).toContain('--output')
    expect(captureHelp.stdout).not.toContain('--export-graph')
    expect(captureHelp.stdout).not.toContain('--snapshot <id>')
    expect(captureHelp.stdout).not.toContain('--route')
    expect(captureHelp.stdout).not.toContain('--dist-dir')
    const exportHelp = await next.runCommand(['analyze', 'export', '--help'])
    expect(exportHelp.exitCode).toBe(0)
    expect(exportHelp.stdout).toContain('analyze export')
    for (const option of [
      '--snapshot <id>',
      '--snapshot-name',
      '--route',
      '--dist-dir',
    ]) {
      expect(exportHelp.stdout).toContain(option)
    }
    expect(exportHelp.stdout).not.toContain('--output')
    expect(exportHelp.stdout).not.toContain('--port')
    const aliasHelp = await next.runCommand([
      'experimental-analyze',
      'export',
      '--help',
    ])
    expect(aliasHelp.exitCode).toBe(0)
    expect(aliasHelp.stdout).toContain('analyze export')
    const rootHelp = await next.runCommand(['--help', 'analyze', 'export'])
    expect(rootHelp.exitCode).toBe(0)
    expect(rootHelp.stdout).toContain('The Next.js CLI')
    const version = await next.runCommand(['--version'])
    expect(version.exitCode).toBe(0)
    expect(version.stdout).toMatch(/^Next\.js v/)
    for (const args of [
      ['analyze', '--version'],
      ['analyze', 'export', '-v'],
      ['experimental-analyze', 'export', '--version'],
      ['--version', 'analyze', 'export'],
      ['build', '--version'],
    ]) {
      const result = await next.runCommand(args)
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toBe(version.stdout)
    }
    let serveProcess: ChildProcess | undefined
    let stdoutBuffer = ''
    let stderrBuffer = ''
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
        onStderr(msg) {
          stderrBuffer += msg
        },
        instance(p) {
          serveProcess = p
        },
      })
      .then(
        (result) => {
          rejectUrl(
            new Error(
              `Analyzer server exited before startup (${result.exitCode}): ${result.stderr || stderrBuffer}\n${result.stdout || stdoutBuffer}`
            )
          )
          return result
        },
        (error) => {
          rejectUrl(error)
          throw error
        }
      )
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
      const historyFile = path.join(
        next.testDir,
        '.next/diagnostics/analyze/history/history.json'
      )
      const before = readFileSync(historyFile, 'utf8')
      const contender = await next.runCommand(['analyze', '--output'])
      expect(contender.exitCode).not.toBe(0)
      const contenderOutput = contender.stderr + contender.stdout
      expect(contenderOutput).toContain('next analyze')
      expect(contenderOutput).toContain('process is already running')
      expect(readFileSync(historyFile, 'utf8')).toBe(before)
    } finally {
      serveProcess?.kill()
      await exit.catch(() => {})
    }
  })

  it('stores the snapshot name in live and historical metadata', async () => {
    const name = 'My snapshot'
    const { exitCode, stderr, stdout } = await next.runCommand([
      'analyze',
      '--output',
      '--snapshot-name',
      name,
    ])

    expect({ exitCode, stderr, stdout }).toMatchObject({ exitCode: 0 })
    expect(stderr).not.toContain('Error')

    const analyzeDir = path.join(next.testDir, '.next/diagnostics/analyze')
    const metadata = JSON.parse(
      readFileSync(path.join(analyzeDir, 'data/metadata.json'), 'utf-8')
    )
    expect(metadata.snapshotName).toBe(name)
    expect(metadata).not.toHaveProperty('baselineName')

    const history = JSON.parse(
      readFileSync(path.join(analyzeDir, 'history/history.json'), 'utf-8')
    )
    expect(history.snapshots[0].snapshotName).toBe(name)
    expect(history.snapshots[0]).not.toHaveProperty('baselineName')
  })

  it('captures and replays from the configured build directory', async () => {
    const configPath = path.join(next.testDir, 'next.config.js')
    const originalConfig = readFileSync(configPath, 'utf8')
    const name = `custom-dir-${Date.now()}`
    try {
      writeFileSync(
        configPath,
        'module.exports = { distDir: "build-output" }\n'
      )
      const capture = await next.runCommand([
        'analyze',
        '--output',
        '--snapshot-name',
        name,
      ])
      expect(capture).toMatchObject({ exitCode: 0 })
      expect(capture.stdout).toContain(
        path.join('build-output', 'diagnostics', 'analyze')
      )
      const customDir = path.join(
        next.testDir,
        'build-output/diagnostics/analyze'
      )
      expect(existsSync(path.join(customDir, 'index.html'))).toBe(true)
      const history = JSON.parse(
        readFileSync(path.join(customDir, 'history/history.json'), 'utf8')
      )
      expect(history.snapshots[0].snapshotName).toBe(name)
      // Saved-data replay must not execute user configuration.
      writeFileSync(
        configPath,
        'throw new Error("Export must not load next.config")\n'
      )
      const replay = await next.runCommand([
        'analyze',
        'export',
        '--dist-dir',
        'build-output',
        '--snapshot-name',
        name,
      ])
      expect(replay.exitCode).toBe(0)
      expect(replay.stderr).not.toContain('Analyzing a production build')
      const records = replay.stdout
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line))
      expect(records[0]).toMatchObject({
        type: 'meta',
        snapshot_id: history.snapshots[0].id,
        schema_version: 1,
      })
      expect(records.some((record) => record.type === 'route')).toBe(true)
      const missingDefault = await next.runCommand([
        'analyze',
        'export',
        '--snapshot-name',
        name,
      ])
      expect(missingDefault.exitCode).not.toBe(0)
      expect(missingDefault.stdout).toBe('')
    } finally {
      writeFileSync(configPath, originalConfig)
    }
  })

  it('captures a named snapshot, then streams its versioned graph without building', async () => {
    const name = 'JSON snapshot'
    const fresh = await next.runCommand([
      'analyze',
      '--output',
      '--snapshot-name',
      name,
    ])
    expect(fresh).toMatchObject({ exitCode: 0 })
    expect(fresh.stdout).toContain('Analyzing a production build')
    const named = await next.runCommand(
      ['analyze', 'export', next.testDir, '--snapshot-name', name],
      { env: { PORT: '39555' } }
    )
    // PORT from the environment must not make replay try to serve the UI.
    expect(named).toMatchObject({ exitCode: 0 })
    validateGraphDump(named.stdout)
    expect(named.stderr).not.toContain('Analyzing a production build')
    const records = named.stdout
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
    expect(records[0]).toMatchObject({ type: 'meta', schema_version: 1 })
    expect(records.some((record) => record.type === 'module')).toBe(true)
    expect(records.some((record) => record.type === 'part')).toBe(true)
    expect(records.some((record) => record.type === 'output')).toBe(true)
    expect(records.some((record) => record.type === 'route')).toBe(true)

    const analyzeDir = path.join(next.testDir, '.next/diagnostics/analyze')
    const history = JSON.parse(
      readFileSync(path.join(analyzeDir, 'history/history.json'), 'utf8')
    )
    const namedSnapshot = history.snapshots.find(
      (snapshot: { snapshotName?: string }) => snapshot.snapshotName === name
    )
    if (!namedSnapshot) throw new Error('Named analyzer snapshot missing')
    const id: string = namedSnapshot.id
    expect(id).toMatch(/^\d{8}-\d{6}-(?:[a-f0-9]{7}|local)-[a-f0-9]{12}$/)
    expect(records[0].snapshot_id).toBe(id)
    expect(
      JSON.parse(
        readFileSync(
          path.join(analyzeDir, 'history', id, 'metadata.json'),
          'utf8'
        )
      ).id
    ).toBe(id)
    const appHeader = readAnalyzeHeader<{ route_entries: RouteEntry[] }>(
      path.join(analyzeDir, 'history', id, 'analyze.data')
    )
    const appRecord = records.find(
      (record) => record.type === 'route' && record.route === '/'
    )
    expect(
      appRecord.entries.map((entry: RouteEntry) => ({
        route_entry_id: entry.route_entry_id,
        module_ident: entry.module_ident,
        role: entry.role,
        entry_kind: entry.entry_kind,
        client_references: entry.client_references,
      }))
    ).toEqual(
      appHeader.route_entries.map((entry) => ({
        route_entry_id: entry.route_entry_id,
        module_ident: entry.module_ident,
        role: entry.role,
        entry_kind: entry.entry_kind ?? null,
        client_references: entry.client_references ?? [],
      }))
    )
    expect(
      existsSync(path.join(analyzeDir, 'history', id, 'graph.ndjson'))
    ).toBe(false)
    const replay = await next.runCommand([
      'analyze',
      'export',
      '--snapshot',
      id,
    ])
    expect(replay.exitCode).toBe(0)
    expect(replay.stdout).toBe(named.stdout)
    const latest = await next.runCommand(['analyze', 'export'])
    expect(latest.exitCode).toBe(0)
    expect(latest.stdout).toBe(named.stdout)
    // Replay by exact ID, without another analysis build.
    const replayAgain = await next.runCommand([
      'analyze',
      'export',
      '--snapshot',
      id,
    ])
    expect(replayAgain.exitCode).toBe(0)
    expect(replayAgain.stdout).toBe(replay.stdout)
    const alias = await next.runCommand([
      'experimental-analyze',
      'export',
      '--snapshot',
      id,
    ])
    expect(alias).toMatchObject({ exitCode: 0 })
    expect(alias.stdout).toBe(replay.stdout)
    expect(replay.stderr).not.toContain('Analyzing a production build')
    const snapshot = path.join(analyzeDir, 'history', id)
    const { header: membershipHeader, binary } =
      readAnalyzeFile<ChunkGraphHeader>(path.join(snapshot, 'analyze.data'))
    const moduleHeader = readAnalyzeHeader<{
      modules: Array<{ ident: string }>
    }>(path.join(snapshot, 'modules.data'))
    const outputRecords = replay.stdout
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
      .filter((record) => record.type === 'output' && record.route === '/')
    const moduleRows = readRows(binary, membershipHeader.output_file_modules)
    expect(outputRecords.map((record) => record.modules)).toEqual(
      moduleRows.map((row) =>
        row.map((index) => moduleHeader.modules[index].ident).sort()
      )
    )
    expect(outputRecords.map((record) => record.coverage)).toEqual(
      membershipHeader.output_file_module_coverage
    )
    const grouped = replay.stdout
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
      .filter((record) => record.type === 'group' && record.route === '/')
    expect(
      grouped.map((record) => ({ id: record.id, outputs: record.outputs }))
    ).toEqual(
      membershipHeader.chunk_groups.map((group) => ({
        id: group.id,
        outputs: group.output_file_indices
          .map((index) => membershipHeader.output_files[index].filename)
          .sort(),
      }))
    )
    expect(
      grouped.every((record) => record.output_file_indices === undefined)
    ).toBe(true)
    const loadEdges = replay.stdout
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
      .filter((record) => record.type === 'load_edge' && record.route === '/')
    const expectedEdges = membershipHeader.chunk_load_edges.map((edge) => ({
      source_output:
        membershipHeader.output_files[edge.source_output_file_index].filename,
      target_output:
        membershipHeader.output_files[edge.target_output_file_index].filename,
      kind: edge.kind,
    }))
    const edgeKeys = (edges: typeof expectedEdges) =>
      edges
        .map((edge) =>
          JSON.stringify([edge.source_output, edge.target_output, edge.kind])
        )
        .sort()
    expect(edgeKeys(loadEdges)).toEqual(edgeKeys(expectedEdges))
    expect(
      loadEdges.every(
        (edge) =>
          edge.source_output_file_index === undefined &&
          edge.target_output_file_index === undefined
      )
    ).toBe(true)
    expect(outputRecords.map((record) => record.unresolved_references)).toEqual(
      membershipHeader.unresolved_output_references
    )
    const root = await next.runCommand([
      'analyze',
      'export',
      '--snapshot',
      id,
      '--route',
      '/',
    ])
    expect(root.exitCode).toBe(0)
    validateGraphDump(root.stdout)
    const rootRecords = root.stdout
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
    expect(rootRecords.filter((record) => record.type === 'module')).toEqual(
      records.filter((record) => record.type === 'module')
    )
    expect(rootRecords.filter((record) => record.type === 'route')).toEqual(
      records.filter(
        (record) => record.type === 'route' && record.route === '/'
      )
    )
    const missing = await next.runCommand([
      'analyze',
      'export',
      '--snapshot',
      id,
      '--route',
      '/does-not-exist',
    ])
    expect(missing.exitCode).not.toBe(0)
    expect(missing.stdout).toBe('')
    expect(missing.stderr).toContain('Unknown analyzer route')
    const traversal = await next.runCommand([
      'analyze',
      'export',
      '--snapshot',
      '../bad',
    ])
    expect(traversal.exitCode).not.toBe(0)
    expect(traversal.stdout).toBe('')
    for (const args of [
      ['analyze', '--output=xml'],
      ['analyze', '--route', '/'],
      ['analyze', '--snapshot', id],
      ['analyze', '--export-graph'],
      ['analyze', 'export', '--export-graph'],
      ['analyze', 'export', '--profile'],
      ['analyze', '--profile', 'export'],
      ['analyze', 'export', '--no-mangling'],
      ['analyze', '--no-mangling', 'export'],
      ['analyze', 'export', '--experimental-app-only'],
      ['analyze', '--experimental-app-only', 'export'],
      ['analyze', '--output', 'export'],
      ['analyze', '--port', '39555', 'export'],
      ['analyze', '--snapshot-name', name, 'export'],
      ['analyze', 'export', '--output'],
      ['analyze', 'export', '--port', '39555'],
    ]) {
      const invalid = await next.runCommand(args)
      expect(invalid.exitCode).not.toBe(0)
      expect(invalid.stdout).toBe('')
    }

    const missingName = await next.runCommand([
      'analyze',
      'export',
      '--snapshot-name',
      'not-a-snapshot',
    ])
    expect(missingName.exitCode).not.toBe(0)
    expect(missingName.stdout).toBe('')
    const conflictingSelectors = await next.runCommand([
      'analyze',
      'export',
      '--snapshot',
      id,
      '--snapshot-name',
      name,
    ])
    expect(conflictingSelectors.exitCode).not.toBe(0)
    expect(conflictingSelectors.stdout).toBe('')
    const conflictingModes = await next.runCommand([
      'analyze',
      'export',
      '--output',
    ])
    expect(conflictingModes.exitCode).not.toBe(0)
    expect(conflictingModes.stdout).toBe('')
    const removedJsonShortcut = await next.runCommand([
      'analyze',
      '--output=json',
    ])
    expect(removedJsonShortcut.exitCode).not.toBe(0)
    expect(removedJsonShortcut.stdout).toBe('')
    const removedGraphJson = await next.runCommand(['analyze', '--graph-json'])
    expect(removedGraphJson.exitCode).not.toBe(0)
    expect(removedGraphJson.stdout).toBe('')
    const explicitPort = await next.runCommand([
      'analyze',
      'export',
      '--port',
      '39555',
    ])
    expect(explicitPort.exitCode).not.toBe(0)
    expect(explicitPort.stdout).toBe('')

    // A later invalid route leaves the already-emitted records on stdout.
    const routeRecords = records.filter((record) => record.type === 'route')
    expect(routeRecords.length).toBeGreaterThan(1)
    const lastRoute = routeRecords[routeRecords.length - 1].route
    const lastRouteFile = path.join(
      analyzeDir,
      'history',
      id,
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
        id,
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
      id,
    ])
    expect(restored.exitCode).toBe(0)
    expect(restored.stdout).toBe(named.stdout)

    const moduleFile = path.join(analyzeDir, 'history', id, 'modules.data')
    const original = readFileSync(moduleFile)
    try {
      const unsupported = Buffer.from(original)
      const headerLength = unsupported.readUInt32BE(0)
      const header = JSON.parse(
        unsupported.toString('utf8', 4, 4 + headerLength)
      )
      const versionedHeader = Buffer.from(
        JSON.stringify({ ...header, schema_version: 999 })
      )
      writeFileSync(
        moduleFile,
        Buffer.concat([
          Buffer.from([
            (versionedHeader.length >>> 24) & 255,
            (versionedHeader.length >>> 16) & 255,
            (versionedHeader.length >>> 8) & 255,
            versionedHeader.length & 255,
          ]),
          versionedHeader,
          unsupported.subarray(4 + headerLength),
        ])
      )
      const unknownVersion = await next.runCommand([
        'analyze',
        'export',
        '--snapshot',
        id,
      ])
      expect(unknownVersion.exitCode).not.toBe(0)
      expect(unknownVersion.stdout).toBe('')
      expect(unknownVersion.stderr).toContain('Unsupported analyzer schema')

      writeFileSync(moduleFile, original.subarray(0, 3))
      const truncated = await next.runCommand([
        'analyze',
        'export',
        '--snapshot',
        id,
      ])
      expect(truncated.exitCode).not.toBe(0)
      expect(truncated.stdout).toBe('')
      expect(truncated.stderr).toContain('Truncated analyzer header')
    } finally {
      writeFileSync(moduleFile, original)
    }

    const routeFile = path.join(analyzeDir, 'history', id, 'analyze.data')
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
        id,
      ])
      expect(mismatch.exitCode).not.toBe(0)
      const partial = mismatch.stdout
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line))
      expect(partial[0]).toMatchObject({ type: 'meta', snapshot_id: id })
      expect(partial.some((record) => record.type === 'module')).toBe(true)
      expect(partial.some((record) => record.route === '/')).toBe(false)
      expect(mismatch.stderr).toContain('module-index fingerprint mismatch')
    } finally {
      writeFileSync(routeFile, routeOriginal)
    }
  })
  it('replays a snapshot created by next build --analyze', async () => {
    const build = await next.runCommand(['build', '--analyze'])
    if (build.exitCode !== 0) {
      throw new Error(
        `next build --analyze failed: ${build.stderr}\n${build.stdout}`
      )
    }
    const analyzeDir = path.join(next.testDir, '.next/diagnostics/analyze')
    const history = JSON.parse(
      readFileSync(path.join(analyzeDir, 'history/history.json'), 'utf8')
    )
    const id = history.snapshots[0].id
    const replay = await next.runCommand([
      'analyze',
      'export',
      '--snapshot',
      id,
    ])
    expect(replay).toMatchObject({ exitCode: 0 })
    validateGraphDump(replay.stdout)
    expect(
      replay.stdout
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line))[0]
    ).toMatchObject({ type: 'meta', snapshot_id: id })
    expect(replay.stderr).not.toContain('Analyzing a production build')
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
          'analyze',
          flag,
          ...(flag === '--output' ? ['.'] : []),
        ])

        expect({ exitCode, stderr, stdout }).toMatchObject({ exitCode: 0 })
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
