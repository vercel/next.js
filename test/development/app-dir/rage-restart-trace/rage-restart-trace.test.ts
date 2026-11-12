import {
  rmSync,
  writeFileSync,
  mkdirSync,
  readFileSync,
  existsSync,
} from 'node:fs'
import { join, dirname } from 'node:path'
import { execSync } from 'node:child_process'
import { getCacheDirectory } from 'next/dist/lib/helpers/get-cache-directory'
import { FileRef, nextTestSetup } from 'e2e-utils'
import {
  expectTraceEventContract,
  parseTraceFile,
} from '../../../lib/parse-trace-file'

describe.each([true, false])(
  'rage restart trace attributes (otelInBuild %s)',
  (otelInBuild) => {
    const instrumentationDir = join(
      __dirname,
      '../../../e2e/app-dir/otel-tooling'
    )
    const { next } = nextTestSetup({
      files: {
        app: new FileRef(join(__dirname, 'app')),
        'instrumentation.ts': new FileRef(
          join(instrumentationDir, 'instrumentation.ts')
        ),
        'instrumentation-node.ts': new FileRef(
          join(instrumentationDir, 'instrumentation-node.ts')
        ),
      },
      nextConfig: { experimental: { otelInBuild } },
      skipStart: true,
      startCommand: `node node_modules/next/dist/bin/next ${process.env.IS_WEBPACK_TEST ? '--webpack' : '--turbopack'}`,
      dependencies: {
        '@opentelemetry/api': '1.9.0',
        '@opentelemetry/sdk-trace': '2.12.0',
        '@opentelemetry/sdk-metrics': '2.12.0',
      },
      env: {
        NEXT_EXIT_TIMEOUT_MS: '30000',
        TOOLING_TRACE_FILE: join('.next', 'dev', 'trace'),
      },
    })

    const getDevStateFilePath = () =>
      join(getCacheDirectory('nextjs-nodejs'), 'dev-state.json')

    afterAll(async () => {
      await next.stop('SIGTERM')
    })

    beforeEach(async () => {
      await next.stop('SIGTERM').catch(() => {})
    })

    const getTracePath = () => join(next.testDir, '.next/dev/trace')

    const getStartDevServerSpan = () => {
      const traceStructure = parseTraceFile(getTracePath())
      expectTraceEventContract(traceStructure.events)
      const spans = traceStructure.eventsByName.get('start-dev-server')
      expect(spans).toBeDefined()
      expect(spans?.length).toBeGreaterThan(0)
      const span = spans!.at(-1)!
      const startups = next.cliOutput
        .split('\n')
        .slice(0, -1)
        .flatMap((line) => {
          const marker = '[tooling-otel]'
          const index = line.indexOf(marker)
          return index === -1
            ? []
            : (JSON.parse(line.slice(index + marker.length)).spans ?? [])
        })
        .filter((span) => span.name === 'start-dev-server')
      const exported = startups.at(-1)
      expect(exported).toBeDefined()
      expect(exported!.attributes).toMatchObject({
        'next.tooling.id': span.id,
        'rage-restart': span.tags['rage-restart'],
        'missing-next-dir': span.tags['missing-next-dir'],
      })
      const [seconds, nanoseconds] = exported!.startTime
      expect(
        Math.abs(seconds * 1000 + nanoseconds / 1e6 - span.startTime!)
      ).toBeLessThan(5)
      return span
    }

    async function runSession() {
      await next.start()
      await next.render$('/')
      await next.stop('SIGTERM')
    }

    it('should not set rage-restart on first start', async () => {
      await runSession()

      const span = getStartDevServerSpan()
      expect(span?.tags?.['rage-restart']).toBe(false)
      expect(span?.tags?.['missing-next-dir']).toBe(false)
    })

    it('should set rage-restart when restarted within threshold', async () => {
      // First session: establish a prior stop time.
      await runSession()
      const firstSession = parseTraceFile(getTracePath()).events
      const firstSessionId = firstSession[0].traceId

      // Second session: restart immediately — should be detected as a rage restart.
      await runSession()

      const restarted = parseTraceFile(getTracePath()).events
      // The writer uses append mode, but normal dev startup cleans the old trace.
      // Preserve this observable behavior in both tracing implementations.
      expect(
        restarted.filter((event) => event.traceId === firstSessionId)
      ).toHaveLength(0)
      expect(restarted.some((event) => event.traceId !== firstSessionId)).toBe(
        true
      )
      const span = getStartDevServerSpan()
      expect(span?.tags?.['rage-restart']).toBe(true)
      expect(span?.tags?.['missing-next-dir']).toBe(false)
    })

    it('should set missing-next-dir when .next is deleted before restart', async () => {
      // First session: establish a prior stop time.
      await runSession()

      // Delete .next to simulate the user clearing the build cache.
      rmSync(join(next.testDir, '.next'), { recursive: true, force: true })

      // Second session: restart — should detect both rage restart and missing .next.
      await runSession()

      const span = getStartDevServerSpan()
      expect(span?.tags?.['rage-restart']).toBe(true)
      expect(span?.tags?.['missing-next-dir']).toBe(true)
    })

    it('should not set rage-restart when the git branch changed between sessions', async () => {
      // next.testDir is a temp directory outside the repo, so it has no git
      // context by default. Initialize a git repo there so getGitBranch() can
      // return a known branch name for comparison.
      execSync('git init && git checkout -b current-test-branch', {
        cwd: next.testDir,
        stdio: 'ignore',
      })

      // Write a dev-state entry that records a recent stop on a *different*
      // branch, bypassing a full first session.
      const devStateFilePath = getDevStateFilePath()
      mkdirSync(dirname(devStateFilePath), { recursive: true })
      const fakeState = {
        [next.testDir]: {
          stopTime: Date.now() - 1000, // 1 second ago — well within the threshold
          distDirPath: join(next.testDir, '.next'),
          gitBranch: 'previous-branch',
        },
      }
      const existingState = existsSync(devStateFilePath)
        ? JSON.parse(readFileSync(devStateFilePath, 'utf8'))
        : {}
      writeFileSync(
        devStateFilePath,
        JSON.stringify({ ...existingState, ...fakeState })
      )

      // Start the server — the current branch ("current-test-branch") differs
      // from the stored one ("previous-branch"), so this should NOT be flagged
      // as a rage restart.
      await runSession()

      const span = getStartDevServerSpan()
      expect(span?.tags?.['rage-restart']).toBe(false)
    })
  }
)
