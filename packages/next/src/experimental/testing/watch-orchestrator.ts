import { createHash } from 'crypto'
import { loadTestConfig } from './config'
import { discoverTests, type DiscoveredTestProject } from './discovery'
import {
  createWatchSession,
  type WatchDiscovery,
} from './incremental/watch-session'
import {
  watchTestFiles,
  type WatchDirectories,
} from './incremental/watch-files'
import { runWatchProcess, WatchOwnershipError } from './watch-process'
import type { ResultEvent } from './reporting/events'
import {
  formatWatchStatus,
  type TestReporterOptions,
} from './reporting/reporter'

interface Discovery extends WatchDiscovery {
  projects: DiscoveredTestProject[]
  directories: WatchDirectories
}

/** Fresh compilation/execution per generation; the scheduler owns no output writer. */
export async function watchTests(
  projectDir: string,
  options: {
    project?: string
    files?: string[]
    signal: AbortSignal
    write(text: string): void
    reporter?: Omit<TestReporterOptions, 'write' | 'projectDir' | 'fileCount'>
    /** Observe the parent-sealed results, including authoritative cleanup failures. */
    onEvent?: (event: ResultEvent) => void
  }
): Promise<{ status: 'failed' | 'cancelled' }> {
  const controller = new AbortController()
  const cancel = () => controller.abort(options.signal.reason)
  if (options.signal.aborted) cancel()
  else options.signal.addEventListener('abort', cancel, { once: true })
  let fatal = false
  let hasRun = false
  const failures: unknown[] = []
  let watcher: Awaited<ReturnType<typeof watchTestFiles>> | undefined
  let session: ReturnType<typeof createWatchSession<Discovery>> | undefined

  async function discover(signal: AbortSignal): Promise<Discovery> {
    signal.throwIfAborted()
    const config = await loadTestConfig(projectDir)
    const projects = await discoverTests(projectDir, config, {
      project: options.project,
      files: options.files,
    })
    if (projects.some((project) => project.profile.environment === 'browser')) {
      throw new Error(
        'Browser watch requires parent-owned application and browser resources; select a Node or RSC project.'
      )
    }
    if (
      projects.some(
        ({ profile }) =>
          profile.mode !== 'development' ||
          profile.runtime !== 'nodejs' ||
          profile.bundler !== 'turbopack' ||
          profile.route !== undefined
      )
    ) {
      throw new Error(
        'Test watch supports route-less development Node/RSC profiles with Turbopack only.'
      )
    }
    const metadata = await runWatchProcess(
      {
        operation: 'metadata',
        projectDir,
        profiles: projects.map((project) => project.profile),
      },
      { signal, write: options.write, reporter: options.reporter }
    ).catch((error) => {
      if (error instanceof WatchOwnershipError) {
        fatal = true
        try {
          report(error)
        } catch (reporterError) {
          failures.push(error, reporterError)
        }
        controller.abort(error)
      }
      throw error
    })
    if (metadata.operation !== 'metadata')
      throw new Error('Invalid watch metadata result.')
    const directories = metadata.directories
    signal.throwIfAborted()
    try {
      await watcher?.update(directories)
    } catch (error) {
      // The source has closed its subscriptions on update failure; waiting for
      // another edit would leave a live scheduler with no change source.
      fatal = true
      controller.abort(error)
      try {
        report(error)
      } catch (reporterError) {
        failures.push(reporterError)
      }
      throw error
    }
    return {
      projects,
      directories,
      entryIds: projects.flatMap((project) =>
        project.entries.map((entry) => entry.id)
      ),
      // Only test configuration and identities; never resolved Next env/config values.
      discoveryRevision: createHash('sha256')
        .update(JSON.stringify(projects))
        .digest('hex'),
    }
  }

  function report(error: unknown) {
    ;(options.reporter?.writeError ?? options.write)(
      `Test watch error: ${error instanceof Error ? error.message : 'Unknown failure'}\n`
    )
  }

  try {
    const initial = await discover(controller.signal)
    watcher = await watchTestFiles({
      ...initial.directories,
      // Filesystem notifications never establish complete compiler dependencies.
      onChange: () => session?.invalidate(),
      onError(error) {
        fatal = true
        controller.abort(error)
        try {
          report(error)
        } catch (reporterError) {
          failures.push(reporterError)
        }
      },
    })
    session = createWatchSession<Discovery>({
      signal: controller.signal,
      discover,
      async run({ discovery, selection, signal }) {
        const selected = new Set(selection.entryIds)
        const projects = discovery.projects.map((project) => ({
          ...project,
          entries: project.entries.filter((entry) => selected.has(entry.id)),
        }))
        try {
          const rerun = hasRun
          hasRun = true
          const response = await runWatchProcess(
            { operation: 'run', projectDir, projects },
            {
              signal,
              write: options.write,
              reporter: { ...options.reporter, rerun },
              onEvent: options.onEvent,
            }
          )
          if (response.operation !== 'run')
            throw new Error('Invalid watch execution result.')
          const result = response.result
          if (result.unsafeCleanup) fatal = true
          if (result.status === 'running') {
            throw new Error('Test run returned without a terminal result.')
          }
          if (
            !signal.aborted &&
            !result.unsafeCleanup &&
            (result.status === 'passed' || result.status === 'failed')
          ) {
            options.write(
              formatWatchStatus(result.status, options.reporter?.color)
            )
          }
          return { status: result.status, unsafeCleanup: result.unsafeCleanup }
        } catch (error) {
          if (signal.aborted && error === signal.reason) throw error
          // Ordinary test/compile failures are results. Unexpected process exit
          // or reporter failure cannot certify output ownership for another run.
          fatal = true
          controller.abort(error)
          throw error
        }
      },
      onError: report,
    })
    await session.closed
    await session.waitForIdle()
  } catch (error) {
    if (!controller.signal.aborted || error !== controller.signal.reason)
      failures.push(error)
  } finally {
    try {
      await watcher?.close()
    } catch (error) {
      failures.push(error)
    }
    try {
      await session?.close()
    } catch (error) {
      failures.push(error)
    } finally {
      options.signal.removeEventListener('abort', cancel)
    }
  }
  if (failures.length === 1) throw failures[0]
  if (failures.length)
    throw new AggregateError(
      failures,
      'Test watch failed and cleanup did not complete successfully.'
    )
  return { status: fatal ? 'failed' : 'cancelled' }
}
