import { nextTestSetup, isNextDev } from 'e2e-utils'
import { waitFor } from 'next-test-utils'
import fs from 'fs/promises'
import path from 'path'

// Regression guard for warm-cache work: after one cold cycle, run a warm
// cycle and snapshot the set of turbo-tasks functions that had any cache
// miss. If a task previously cached (e.g. via a persistable entries map)
// regresses to recomputing on warm restart, this snapshot will change and
// fail the test.
//
// When the snapshot moves:
//   - FEWER entries → that's a win. Run with `-u` and commit the new snapshot.
//   - MORE entries → something is recomputing on warm start. Investigate
//                    before updating.
//
// Dev and start (build) snapshots are kept separate because the warm graphs
// differ: dev brings up HMR/Fast Refresh infra that build doesn't.

interface TaskFunctionStatistics {
  cache_hit: number
  cache_miss: number
}
type TaskStats = Record<string, TaskFunctionStatistics>

const STATS_RELATIVE_PATH = '.next/warm-restart-task-stats.json'

;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'warm-restart task statistics',
  () => {
    const env = [
      'ENABLE_CACHING=1',
      'TURBO_ENGINE_IGNORE_DIRTY=1',
      'TURBO_ENGINE_SNAPSHOT_IDLE_TIMEOUT_MILLIS=1000',
      `NEXT_TURBOPACK_TASK_STATISTICS=${STATS_RELATIVE_PATH}`,
      // The task-statistics file is written by an `on_exit` handler in the
      // napi binding. In dev that handler only runs if the child process
      // gets a chance to clean up (i.e. SIGTERM, not SIGKILL). The parent
      // `next dev` process gives the child 100ms by default before
      // escalating to SIGKILL — bump that so the on-exit handler can flush.
      'NEXT_EXIT_TIMEOUT_MS=30000',
    ].join(' ')

    const { skipped, next } = nextTestSetup({
      files: __dirname,
      skipDeployment: true,
      packageJson: {
        packageManager: 'npm@10.9.2',
        scripts: {
          build: `${env} next build`,
          dev: `${env} next dev`,
          start: 'next start',
        },
      },
      installCommand: 'npm i',
      buildCommand: 'npm run build',
      startCommand: isNextDev ? 'npm run dev' : 'npm run start',
    })

    if (skipped) {
      return
    }

    beforeAll(() => {
      // No file edits in this test — skip HMR debounce.
      ;(next as any).handleDevWatchDelayBeforeChange = () => {}
      ;(next as any).handleDevWatchDelayAfterChange = () => {}
    })

    async function stop() {
      if (isNextDev) {
        // Persistent cache snapshot is on a 1s idle timer; give it room.
        await waitFor(3000)
        // SIGTERM (not the harness default SIGKILL) so the dev server gets
        // to run its cleanup, which is what flushes the task-stats file.
        await next.stop('SIGTERM')
      } else {
        await next.stop()
      }
    }

    async function readMissedTaskNames(): Promise<string[]> {
      const absPath = path.join(next.testDir, STATS_RELATIVE_PATH)
      const raw = await fs.readFile(absPath, 'utf8')
      const stats = JSON.parse(raw) as TaskStats
      const misses: string[] = []
      for (const [name, s] of Object.entries(stats)) {
        if (s.cache_miss > 0) misses.push(name)
      }
      // Turbopack sorts on the Rust side, but sort again here to be robust
      // against the JSON parser's object iteration order.
      misses.sort()
      return misses
    }

    if (isNextDev) {
      it('snapshot of tasks with cache misses on warm dev restart', async () => {
        // Cycle 1: the harness already auto-started; perform a request so the
        // SSR/Node chunk work runs and gets persisted on shutdown.
        async function runDevCycle() {
          const browser = await next.browser('/')
          // Wait for actual rendered content before declaring "ready".
          await browser.elementByCss('p')
          // Settle: the dev server keeps doing background work after first
          // paint (HMR socket handshake, tail compilation). A fixed sleep
          // is the least-bad option here since next.js doesn't expose
          // turbopack's internal idle signal. If this proves flaky in CI,
          // raise the value.
          await waitFor(2000)
          await browser.close()
        }
        await runDevCycle()
        await stop()

        // Cycle 2: warm.
        await next.start()
        await runDevCycle()
        await stop()

        const missed = await readMissedTaskNames()
        expect(missed).toMatchInlineSnapshot(`
         [
           "<dyn turbopack_core::version::VersionedContent>::update",
           "<turbopack_browser::ecmascript::list::content::EcmascriptDevChunkListContent as dyn turbopack_core::version::VersionedContent>::update",
           "<turbopack_nodejs::ecmascript::node::content::EcmascriptBuildNodeChunkContent as dyn turbopack_core::version::VersionedContent>::update",
           "next_api::project::Project::hmr_update",
           "next_api::project::Project::hmr_version_state",
           "next_napi_bindings::next_api::project::hmr_update_with_issues_operation",
           "next_napi_bindings::next_api::project::project_hmr_update_operation",
           "turbopack_core::version::VersionState::get",
         ]
        `)
      }, 180_000)
    } else {
      it('snapshot of tasks with cache misses on warm build', async () => {
        // In start mode the harness auto-runs `next build` then `next start`.
        // The build is cycle 1. We stop the server (we don't care about it)
        // and run a second build manually for the warm measurement.
        await stop()

        const result = await (next as any).build()
        if (result.exitCode !== 0) {
          throw new Error(`next build exited with ${result.exitCode}`)
        }

        const missed = await readMissedTaskNames()
        expect(missed).toMatchInlineSnapshot(`[]`)
      }, 240_000)
    }
  }
)
