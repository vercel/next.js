import { existsSync } from 'fs'
import { readFile, readdir } from 'fs/promises'
import path, { join } from 'path'
import type { ChildProcess } from 'child_process'
import spawn from 'cross-spawn'
import treeKill from 'tree-kill'
import { nextTestSetup } from 'e2e-utils'
import { findPort, retry } from 'next-test-utils'
import { LAYOUT_SEGMENT_SHARED_MARKER } from './app/shared-layout-module'

const nextBin = path.join(
  path.dirname(require.resolve('next/package')),
  'dist/bin/next'
)

/** Run `next internal query-trace` and return its stdout. */
function runQueryTraceCli(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      'node',
      ['--no-deprecation', nextBin, 'internal', 'query-trace', ...args],
      { stdio: 'pipe' }
    )
    let stdout = ''
    let stderr = ''
    proc.stdout?.on('data', (chunk: Buffer) => (stdout += chunk.toString()))
    proc.stderr?.on('data', (chunk: Buffer) => (stderr += chunk.toString()))
    proc.on('close', (code) => {
      if (code === 0) resolve(stdout)
      else reject(new Error(`query-trace exited with ${code}:\n${stderr}`))
    })
  })
}

type QuerySpansResult = {
  spans: Array<{ id: string; name: string }>
  page: number
  totalPages: number
  totalCount: number
}

describe('layout-segment-chunk-sharing', () => {
  const { next, isNextDev, isTurbopack, skipped } = nextTestSetup({
    files: __dirname,
    // Write a Turbopack trace so the chunking tasks can be counted below.
    env: { NEXT_TURBOPACK_TRACING: '1' },
    // This suite inspects the on-disk build output and a local build trace to
    // assert how modules were chunked, neither of which is reachable on a
    // deployment.
    skipDeployment: true,
  })

  if (skipped) return

  it('renders the shared module from every segment', async () => {
    const $ = await next.render$('/dashboard/one')
    expect($('#root-layout').text()).toBe(
      `root:${LAYOUT_SEGMENT_SHARED_MARKER}`
    )
    expect($('#dashboard-layout').text()).toBe(
      `dashboard:${LAYOUT_SEGMENT_SHARED_MARKER}`
    )
    expect($('#page-one').text()).toBe(`one:${LAYOUT_SEGMENT_SHARED_MARKER}`)
  })

  // The layout segment chunking optimization hands each nested segment the
  // availability info of its parent, so a module already emitted into an
  // ancestor segment's chunks must not be emitted again for a descendant.
  //
  // `app/shared-layout-module.ts` is imported by the root layout, the nested
  // `dashboard` layout and both sibling pages under it. If the optimization
  // holds it is emitted exactly once; if chunk sharing regresses it is
  // duplicated into the chunks of each segment that imports it.
  //
  // This holds for Turbopack in both dev and production. It does not hold for
  // webpack, which builds a self-contained server bundle per route, so the
  // module is legitimately present in each of them -- hence the gate is on the
  // bundler, not on the mode.
  ;(!isTurbopack ? describe.skip : describe)('chunk sharing', () => {
    it('emits the shared layout module into exactly one server chunk', async () => {
      // `next dev` and `next build` write their output to different trees.
      const serverDir = isNextDev
        ? join(next.testDir, '.next', 'dev', 'server')
        : join(next.testDir, '.next', 'server')

      const entries = await readdir(serverDir, {
        recursive: true,
        withFileTypes: true,
      })

      const chunkFiles = entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
        .map((entry) => join(entry.parentPath ?? entry.path, entry.name))

      // Guard against the assertion silently passing because the glob found
      // nothing (e.g. if the output layout changes).
      expect(chunkFiles.length).toBeGreaterThan(0)

      const matching: string[] = []
      for (const file of chunkFiles) {
        const contents = await readFile(file, 'utf8')
        if (contents.includes(LAYOUT_SEGMENT_SHARED_MARKER)) {
          matching.push(file.slice(serverDir.length + 1))
        }
      }

      expect(matching).toHaveLength(1)
    })
  })

  // Emitting the shared module once (above) only shows that the chunk
  // *outputs* are shared. It does not show that the chunking *work* is: the
  // `dashboard` layout segment could still be re-chunked once per page under
  // it, each time producing an identical result.
  //
  // So count the chunking task executions in the build trace. A turbo-tasks
  // cache hit produces no execution span, so the number of chunking spans for a
  // segment is the number of times it was actually chunked. A production build
  // uses a single module graph for the whole app, so the segment shared by
  // `/dashboard/one` and `/dashboard/two` must be chunked exactly once.
  //
  // Production only: in development every page gets its own module graph and
  // compiles on demand, so chunking a segment once per page is expected there.
  ;(!isTurbopack || isNextDev ? describe.skip : describe)(
    'layout segment chunking in the build trace',
    () => {
      let traceServerProcess: ChildProcess | undefined
      let mcpPort: number

      beforeAll(async () => {
        const traceFile = join(
          next.testDir,
          '.next-profiles',
          'trace-turbopack.bin'
        )
        await retry(
          async () => {
            if (!existsSync(traceFile)) {
              throw new Error(`Trace file not found yet: ${traceFile}`)
            }
          },
          15_000,
          500
        )

        mcpPort = await findPort()
        traceServerProcess = spawn(
          'node',
          [
            '--no-deprecation',
            nextBin,
            'internal',
            'trace',
            traceFile,
            '--mcp-port',
            String(mcpPort),
          ],
          { stdio: 'inherit' }
        )

        // Wait for the MCP HTTP server to be ready.
        await retry(
          async () => {
            const res = await fetch(`http://127.0.0.1:${mcpPort}/mcp`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json, text/event-stream',
              },
              body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'tools/list',
                id: 0,
              }),
            })
            if (res.status >= 500) {
              throw new Error(`MCP server not ready (HTTP ${res.status})`)
            }
          },
          30_000,
          500
        )
      }, 120_000)

      afterAll(async () => {
        if (traceServerProcess?.pid) {
          await new Promise<void>((resolve) => {
            treeKill(traceServerProcess!.pid!, 'SIGKILL', () => resolve())
          })
          traceServerProcess = undefined
        }
      })

      /** Every span, on every page, whose name contains `search`. */
      async function findSpans(search: string) {
        const names: string[] = []
        for (let page = 1; ; page++) {
          const result: QuerySpansResult = JSON.parse(
            await runQueryTraceCli([
              '--port',
              String(mcpPort),
              // Aggregated mode (the default) only searches the root level and
              // silently finds nothing for spans nested below it.
              '--no-aggregated',
              '--json',
              '--search',
              search,
              '--page',
              String(page),
            ])
          )
          names.push(...result.spans.map((span) => span.name))
          if (page >= result.totalPages) return names
        }
      }

      it('chunks the shared dashboard layout segment exactly once', async () => {
        // The chunking span name embeds the module ident, e.g.
        //   turbopack_nodejs::chunking_context chunking
        //     [project]/app/dashboard/layout.tsx [app-rsc] (ecmascript, Next.js Server Component)
        const ident =
          'app/dashboard/layout.tsx [app-rsc] (ecmascript, Next.js Server Component)'

        // `--search` is a plain substring filter, so it also matches spans that
        // merely *mention* this ident (e.g. analysis of the pages importing it).
        // Keep only the chunking of the segment itself: anchored on the
        // operation, and ending at the ident so the `client modules` and
        // `ssr modules` chunk groups of the same segment are not counted.
        const segmentChunking =
          /^turbopack_nodejs::chunking_context chunking \[project\]\/(?:.*\/)?app\/dashboard\/layout\.tsx \[app-rsc\] \(ecmascript, Next\.js Server Component\)$/

        const spans = await findSpans(ident)
        expect(spans.filter((name) => segmentChunking.test(name))).toHaveLength(
          1
        )
      })
    }
  )
})
