import { randomUUID } from 'node:crypto'
import type { BrowserFixtureHost, RegisteredBrowserFixture } from '../contracts'
import { appendFileSync } from 'node:fs'
import { mkdir, mkdtemp, realpath, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { runTestProcess } from '../execution/process'
import { BrowserFixtureError } from './context'

export interface ApplicationServerAttachment {
  name: string
  kind: 'file'
  path: string
  contentType: string
}

export class ApplicationServerError extends BrowserFixtureError {
  constructor(
    errors: unknown[],
    readonly attachments: ApplicationServerAttachment[]
  ) {
    super('Next application server failed', errors)
    this.name = 'ApplicationServerError'
  }
}

export interface ApplicationServer {
  baseURL: string
  componentHost?: { routePrefix: string; fixtureIds: readonly string[] }
  pid: number
  lifetime: 'file'
  build?: {
    buildId: string
    testingApiEnabled: boolean
    manifests: Record<string, string>
  }
  attachments: ApplicationServerAttachment[]
  /** Await after the driver child has closed, including after its hard kill. */
  dispose(): Promise<void>
}

// Prevent concurrent output writers owned by this coordinator. The caller must
// also hold an exclusive workspace lease against the compiler/other processes.
const activeProjects = new Set<string>()

export async function createApplicationServer(options: {
  projectDir: string
  mode: 'development' | 'production'
  /** Evidence from the compiler's actual resolved Next configuration. */
  outputLockEnabled: boolean
  /** Actual configured output directory, required for a production build. */
  distDir?: string
  browserFixtures?: readonly RegisteredBrowserFixture[]
  outputDir: string
  /** Acquisition cancellation only. An acquired lease lives until dispose. */
  signal: AbortSignal
  startupTimeoutMs?: number
  shutdownGraceMs?: number
}): Promise<ApplicationServer> {
  if (options.mode === 'production' && !options.distDir) {
    throw new Error(
      'Production application-server leases require the resolved distDir'
    )
  }
  if (options.outputLockEnabled !== true) {
    throw new Error(
      'Next testing application servers require experimental.lockDistDir to be enabled in the resolved application configuration'
    )
  }
  if (options.browserFixtures?.length && options.mode !== 'development') {
    throw new Error('Browser component mounting supports development only')
  }
  const browserFixtureHost: BrowserFixtureHost | undefined = options
    .browserFixtures?.length
    ? {
        routePrefix: `/__next_testing_${randomUUID().replaceAll('-', '')}`,
        fixtures: options.browserFixtures,
      }
    : undefined
  const startupTimeoutMs =
    options.startupTimeoutMs ??
    (options.mode === 'production' ? 300_000 : 60_000)
  const shutdownGraceMs = options.shutdownGraceMs ?? 5_000
  for (const timeout of [startupTimeoutMs, shutdownGraceMs]) {
    if (!Number.isFinite(timeout) || timeout < 0 || timeout > 2147483647) {
      throw new Error('Invalid Next application-server timeout')
    }
  }
  options.signal.throwIfAborted()
  const projectDir = await realpath(options.projectDir)
  if (activeProjects.has(projectDir)) {
    throw new Error(
      'A Next testing application server already owns this project directory'
    )
  }
  activeProjects.add(projectDir)

  let owned = false
  try {
    await mkdir(options.outputDir, { recursive: true })
    const outputDir = await mkdtemp(join(resolve(options.outputDir), 'server-'))
    const paths = {
      stdout: join(outputDir, 'stdout.log'),
      stderr: join(outputDir, 'stderr.log'),
    }
    await Promise.all([
      writeFile(paths.stdout, ''),
      writeFile(paths.stderr, ''),
    ])
    const attachments: ApplicationServerAttachment[] = (
      ['stdout', 'stderr'] as const
    ).map((stream) => ({
      name: `Next application server ${stream}`,
      kind: 'file',
      path: paths[stream],
      contentType: 'text/plain',
    }))
    options.signal.throwIfAborted()
    const controller = new AbortController()
    let stopping = false
    let failure: unknown
    let pid: number | undefined
    let ready: (baseURL: string) => void
    let rejectReady: (error: unknown) => void
    const started = new Promise<string>((resolveReady, reject) => {
      ready = resolveReady
      rejectReady = reject
    })
    let componentRoutePrefix: string | undefined
    let build: ApplicationServer['build']
    const completed = runTestProcess(
      options.mode === 'production'
        ? require.resolve('./production-worker')
        : require.resolve('./server-worker'),
      {
        cwd: projectDir,
        env: {
          ...process.env,
          NODE_ENV: options.mode,
          __NEXT_DEV_SERVER: options.mode === 'development' ? '1' : undefined,
          TURBOPACK: '1',
          NEXT_PRIVATE_WORKER: '1',
          NEXT_PRIVATE_START_TIME: String(Date.now()),
          WATCHPACK_WATCHER_LIMIT:
            process.platform === 'darwin'
              ? '20'
              : process.env.WATCHPACK_WATCHER_LIMIT,
        },
        input: {
          projectDir,
          mode: options.mode,
          distDir: options.distDir,
          browserFixtureHost,
        },
        signal: controller.signal,
        shutdownGraceMs,
        onOutput(stream, chunk) {
          // The supervisor catches synchronous sink errors and stops the group.
          // Persist raw logs as owned files; never interpolate them into errors.
          appendFileSync(paths[stream], chunk)
        },
        onMessage(message) {
          if (!message || typeof message !== 'object') return
          if ('nextApplicationBuild' in message) {
            if (
              options.mode !== 'production' ||
              build ||
              !('buildId' in message) ||
              typeof message.buildId !== 'string' ||
              !('testingApiEnabled' in message) ||
              typeof message.testingApiEnabled !== 'boolean' ||
              !('manifests' in message) ||
              !message.manifests ||
              typeof message.manifests !== 'object' ||
              Object.keys(message.manifests).sort().join(',') !==
                'BUILD_ID,prerender-manifest.json,required-server-files.json,routes-manifest.json' ||
              Object.values(message.manifests).some(
                (hash) =>
                  typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)
              )
            )
              throw new Error(
                'Invalid Next application-build readiness message'
              )
            build = {
              buildId: message.buildId,
              testingApiEnabled: message.testingApiEnabled,
              manifests: message.manifests as Record<string, string>,
            }
          }
          if (
            'nextApplicationServerProcess' in message &&
            'pid' in message &&
            typeof message.pid === 'number'
          ) {
            pid = message.pid
          }
          if (
            'nextServerReady' in message &&
            message.nextServerReady === true &&
            'port' in message
          ) {
            const port = Number(message.port)
            if (
              (options.mode === 'production' &&
                (!build ||
                  !('buildId' in message) ||
                  message.buildId !== build.buildId)) ||
              !pid ||
              !Number.isInteger(port) ||
              port < 1 ||
              port > 65535
            ) {
              throw new Error(
                'Invalid Next application-server readiness message'
              )
            }
            if (browserFixtureHost) {
              if (
                !('basePath' in message) ||
                typeof message.basePath !== 'string'
              ) {
                throw new Error(
                  'Browser fixture server omitted its resolved basePath'
                )
              }
              componentRoutePrefix =
                message.basePath + browserFixtureHost.routePrefix
            }
            ready(`http://127.0.0.1:${port}`)
          }
        },
      }
    ).then(
      (exit) => {
        // Cancellation describes who requested shutdown, not whether the
        // server's cleanup succeeded. Next exits 143 after handling SIGTERM;
        // the supervisor may also observe normal exit or force termination.
        const expectedShutdown =
          stopping &&
          exit.reason === 'cancelled' &&
          ((exit.signal === null && (exit.code === 0 || exit.code === 143)) ||
            (exit.code === null &&
              (exit.signal === 'SIGTERM' || exit.signal === 'SIGKILL')))
        if (!expectedShutdown) {
          failure = new Error(
            `Next application server exited unexpectedly (code ${exit.code}, signal ${exit.signal})`
          )
          rejectReady(failure)
        }
      },
      (error) => {
        failure = error
        rejectReady(error)
      }
    )
    let disposal: Promise<void> | undefined
    const dispose = () =>
      (disposal ??= (async () => {
        stopping = true
        controller.abort()
        try {
          await completed
          if (failure !== undefined) {
            if (owned) throw new ApplicationServerError([failure], attachments)
            // Acquisition wraps the original failure and logs below. Keep its
            // identity here so one startup error is not reported twice.
            throw failure
          }
        } finally {
          activeProjects.delete(projectDir)
        }
      })())
    const abort = () => rejectReady(options.signal.reason)
    options.signal.addEventListener('abort', abort, { once: true })
    const timer = setTimeout(
      () =>
        rejectReady(
          new Error(
            `Next application server did not become ready within ${startupTimeoutMs}ms`
          )
        ),
      startupTimeoutMs
    )
    try {
      if (options.signal.aborted) abort()
      const baseURL = await started
      options.signal.throwIfAborted()
      owned = true
      return {
        baseURL,
        pid: pid!,
        lifetime: 'file',
        build,
        attachments,
        dispose,
        componentHost: browserFixtureHost
          ? {
              routePrefix: componentRoutePrefix!,
              fixtureIds: browserFixtureHost.fixtures.map(({ id }) => id),
            }
          : undefined,
      }
    } catch (error) {
      const errors = [error]
      try {
        await dispose()
      } catch (cleanupError) {
        if (cleanupError !== error) errors.push(cleanupError)
      }
      throw new ApplicationServerError(errors, attachments)
    } finally {
      clearTimeout(timer)
      options.signal.removeEventListener('abort', abort)
    }
  } finally {
    if (!owned) activeProjects.delete(projectDir)
  }
}
