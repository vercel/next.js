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
        expect(routes).toEqual(['/', '/_not-found'])
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
      })
    })
  })
})
