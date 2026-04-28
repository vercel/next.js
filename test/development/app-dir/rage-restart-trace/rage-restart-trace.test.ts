import { rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { execSync } from 'node:child_process'
import { getCacheDirectory } from 'next/dist/lib/helpers/get-cache-directory'
import { nextTestSetup } from 'e2e-utils'
import { parseTraceFile } from '../../../lib/parse-trace-file'

describe('rage restart trace attributes', () => {
  // Use a fake upload URL so traceUploadUrl is set and detection runs.
  // The URL doesn't need to be reachable — we inspect the trace file directly.
  const fakeUploadUrl = 'http://localhost:19999'

  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    startArgs: ['--experimental-upload-trace', fakeUploadUrl],
  })

  if (!isNextDev) {
    it('should be skipped in production', () => {})
    return
  }

  const getDevStateFilePath = () =>
    join(getCacheDirectory('nextjs-nodejs'), 'dev-state.json')

  beforeEach(async () => {
    // Ensure each test starts from a clean stopped state with no prior session.
    await next.stop('SIGTERM').catch(() => {})
    rmSync(getDevStateFilePath(), { force: true })
  })

  const getTracePath = () => join(next.testDir, '.next/dev/trace')

  const getStartDevServerSpan = () => {
    const traceStructure = parseTraceFile(getTracePath())
    const spans = traceStructure.eventsByName.get('start-dev-server')
    expect(spans).toBeDefined()
    expect(spans?.length).toBeGreaterThan(0)
    // Trace file is appended across restarts; take the most recent span.
    return spans?.[spans.length - 1]
  }

  it('should not set rage-restart on first start', async () => {
    await next.start()
    await next.render$('/')
    await next.stop('SIGTERM')

    const span = getStartDevServerSpan()
    expect(span?.tags?.['rage-restart']).toBe(false)
    expect(span?.tags?.['missing-next-dir']).toBe(false)
  })

  it('should set rage-restart when restarted within threshold', async () => {
    // First session: establish a prior stop time.
    await next.start()
    await next.render$('/')
    await next.stop('SIGTERM')

    // Second session: restart immediately — should be detected as a rage restart.
    await next.start()
    await next.render$('/')
    await next.stop('SIGTERM')

    const span = getStartDevServerSpan()
    expect(span?.tags?.['rage-restart']).toBe(true)
    expect(span?.tags?.['missing-next-dir']).toBe(false)
  })

  it('should set missing-next-dir when .next is deleted before restart', async () => {
    // First session: establish a prior stop time.
    await next.start()
    await next.render$('/')
    await next.stop('SIGTERM')

    // Delete .next to simulate the user clearing the build cache.
    rmSync(join(next.testDir, '.next'), { recursive: true, force: true })

    // Second session: restart — should detect both rage restart and missing .next.
    await next.start()
    await next.render$('/')
    await next.stop('SIGTERM')

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
    writeFileSync(devStateFilePath, JSON.stringify(fakeState))

    // Start the server — the current branch ("current-test-branch") differs
    // from the stored one ("previous-branch"), so this should NOT be flagged
    // as a rage restart.
    await next.start()
    await next.render$('/')
    await next.stop('SIGTERM')

    const span = getStartDevServerSpan()
    expect(span?.tags?.['rage-restart']).toBe(false)
  })
})
