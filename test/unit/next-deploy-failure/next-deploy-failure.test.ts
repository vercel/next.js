import execa from 'execa'
import { trace } from 'next/dist/trace'

jest.mock('execa', () => jest.fn())

// A fake clock for the deploy harness's polling: when installed, `Date.now()`
// reads it and every `setTimeout` from `timers/promises` advances it instead
// of waiting.
let mockClock: { now: number; waits: number[]; oversleepMs?: number } | null =
  null
jest.mock('timers/promises', () => ({
  ...jest.requireActual('timers/promises'),
  setTimeout: jest.fn(async (ms: number) => {
    if (mockClock) {
      mockClock.waits.push(ms)
      mockClock.now += ms + (mockClock.oversleepMs ?? 0)
    }
  }),
}))

// Initialize the real harness in deploy mode, without running a deployment.
const originalMode = process.env.NEXT_TEST_MODE
process.env.NEXT_TEST_MODE = 'deploy'
const { nextTestSetup } =
  require('../../lib/e2e-utils') as typeof import('../../lib/e2e-utils')
if (originalMode === undefined) delete process.env.NEXT_TEST_MODE
else process.env.NEXT_TEST_MODE = originalMode

const { NextDeployInstance } =
  require('../../lib/next-modes/next-deploy') as typeof import('../../lib/next-modes/next-deploy')
const { NextInstance } =
  require('../../lib/next-modes/base') as typeof import('../../lib/next-modes/base')

const deploymentUrl = 'https://fixture.vercel.app'
const diagnostic =
  'Invalid revalidate value "1" on "/", must be a non-negative number or false'
const ids =
  'BUILD_ID: build-id\nDEPLOYMENT_ID: deployment-id\nNEXT_SUPPORTS_IMMUTABLE_ASSETS: 1'
const cliHeader = `Vercel CLI 63.1.2 (Node.js 20.9.0)\nFetching deployment "fixture.vercel.app" in team\nstatus\t● Ready\n`
type Result = {
  exitCode: number | undefined
  stdout: string
  stderr: string
  timedOut?: boolean
}
type InspectCall = { at: number | undefined; timeout: number | undefined }

describe('deployment lifecycle', () => {
  let deployResult: Result
  let logs: Result
  let customLogs: Result
  // Results for successive `vercel inspect` calls; `logs` once exhausted.
  let inspectResults: Array<Result | Error | ((call: InspectCall) => Result)>
  let inspectCalls: InspectCall[]
  let deployDurationMs: number
  // Results for successive `vercel deploy` calls; `deployResult` once exhausted.
  let deployResults: Result[]

  beforeEach(() => {
    mockClock = null
    deployDurationMs = 0
    deployResults = []
    inspectResults = []
    inspectCalls = []
    jest.replaceProperty(process, 'env', {
      ...process.env,
      NEXT_TEST_MODE: 'deploy',
      NEXT_TEST_VERSION: 'test-unit',
      NEXT_TEST_DEPLOY_URL: '',
      NEXT_TEST_DEPLOY_SCRIPT_PATH: '',
      NEXT_TEST_DEPLOY_LOGS_SCRIPT_PATH: '',
      NEXT_TEST_CLEANUP_SCRIPT_PATH: '',
      NEXT_TEST_PROXY_ADDRESS: '',
      NEXT_TEST_JOB: '',
      VERCEL_FORCE_BUILD_IN_HIVE: '',
      VERCEL_BUILD_CONTAINER_VERSION: '',
    })
    jest.spyOn(require('console'), 'log').mockImplementation(() => {})
    jest.spyOn(require('console'), 'error').mockImplementation(() => {})
    jest.spyOn(NextInstance.prototype, 'setup').mockResolvedValue()
    jest
      .spyOn(NextInstance.prototype, 'destroy')
      .mockImplementation(async function (this: any) {
        this.emit('destroy', [])
      })
    jest
      .spyOn(NextInstance.prototype as any, 'createTestDir')
      .mockResolvedValue(undefined)
    jest
      .spyOn(NextDeployInstance.prototype as any, 'writeMirrorNpmrcIfNecessary')
      .mockResolvedValue(undefined)
    jest
      .spyOn(NextDeployInstance.prototype as any, 'preparePnpmSettings')
      .mockReturnValue(undefined)
    jest
      .spyOn(NextDeployInstance.prototype as any, 'configureProxyAddress')
      .mockResolvedValue(undefined)

    deployResult = { exitCode: 1, stdout: deploymentUrl, stderr: '' }
    logs = { exitCode: 1, stdout: '', stderr: diagnostic }
    customLogs = { ...logs, exitCode: 0 }

    jest
      .mocked(execa)
      .mockReset()
      .mockImplementation((command, args) => {
        let result: Result
        if (command === 'mock-deploy') {
          result = deployResult
        } else if (command === 'mock-logs') {
          result = customLogs
        } else if (command === 'mock-cleanup') {
          result = { exitCode: 0, stdout: '', stderr: '' }
        } else if (command === 'vercel' && Array.isArray(args)) {
          switch (args[0]) {
            case '--version':
            case 'link':
              result = { exitCode: 0, stdout: '', stderr: '' }
              break
            case 'deploy':
              if (mockClock) mockClock.now += deployDurationMs
              result = deployResults.shift() ?? deployResult
              break
            case 'inspect': {
              const [, , options] = jest
                .mocked(execa)
                .mock.calls.at(-1) as unknown as [
                string,
                string[],
                execa.Options | undefined,
              ]
              const call: InspectCall = {
                at: mockClock?.now,
                timeout: options?.timeout,
              }
              inspectCalls.push(call)
              const next = inspectResults.shift() ?? logs
              if (next instanceof Error) {
                return Promise.reject(next) as unknown as ReturnType<
                  typeof execa
                >
              }
              result = typeof next === 'function' ? next(call) : next
              break
            }
            default:
              throw new Error('Unexpected Vercel command')
          }
        } else {
          throw new Error('Unexpected subprocess')
        }
        return Promise.resolve(result) as unknown as ReturnType<typeof execa>
      })
  })

  afterEach(() => {
    jest.restoreAllMocks()
    mockClock = null
  })

  // Starts the fake clock. `vercel deploy` takes `deployMs` on it.
  function installClock(deployMs = 0) {
    const clock: NonNullable<typeof mockClock> = {
      now: 1_000_000,
      waits: [],
    }
    mockClock = clock
    deployDurationMs = deployMs
    jest.spyOn(Date, 'now').mockImplementation(() => clock.now)
    return clock
  }

  // A `vercel inspect` call that hangs until its execa timeout kills it.
  function hungInspect(clock: { now: number }) {
    return (call: InspectCall): Result => {
      clock.now += call.timeout ?? 0
      return { exitCode: undefined, stdout: '', stderr: '', timedOut: true }
    }
  }

  async function instance() {
    const next = new NextDeployInstance({ files: __dirname })
    await next.setup(trace('test'))
    return next
  }

  function setupHarness(skipStart: boolean) {
    let setup!: () => Promise<void>
    let teardown!: () => Promise<void>
    jest.spyOn(global, 'beforeAll').mockImplementation((hook) => {
      setup = hook as () => Promise<void>
    })
    jest.spyOn(global, 'afterAll').mockImplementation((hook) => {
      teardown = hook as () => Promise<void>
    })
    const { next } = nextTestSetup({ files: __dirname, skipStart })
    return { next, setup, teardown }
  }

  function successfulDeployment() {
    deployResult.exitCode = 0
    logs = { exitCode: 0, stdout: '', stderr: ids }
    customLogs = logs
  }

  it('skipStart leaves deployment to the test body, where failures can be asserted', async () => {
    const { next, setup, teardown } = setupHarness(true)
    try {
      await setup()
      expect(execa).not.toHaveBeenCalled()
      expect(next.cliOutput).toBe('')

      await expect(next.start()).rejects.toThrow('Failed to deploy project')
      expect(next.cliOutput).toContain(diagnostic)
    } finally {
      await teardown()
    }
  })

  it('nextTestSetup still deploys automatically by default', async () => {
    successfulDeployment()
    const { next, setup, teardown } = setupHarness(false)
    try {
      await setup()
      expect(next.url).toBe(deploymentUrl)
      expect(next.buildId).toBe('build-id')
    } finally {
      await teardown()
    }
  })

  it('an uncaught deployment failure still rejects the default setup hook', async () => {
    const { setup, teardown } = setupHarness(false)
    try {
      await expect(setup()).rejects.toThrow('Failed to deploy project')
      expect(NextInstance.prototype.destroy).toHaveBeenCalled()
    } finally {
      await teardown()
    }
  })

  it('collects failed build logs before start rejects, without requiring build IDs', async () => {
    const next = await instance()
    deployResult.stderr = 'Build command failed\n'
    await expect(next.start()).rejects.toThrow(deployResult.stderr)
    expect(next.cliOutput).not.toContain(deployResult.stderr)
    expect(next.cliOutput).toContain(diagnostic)
    expect(next.buildId).toBeUndefined()
    expect(next.url).toBe(deploymentUrl + '/')
    expect(execa).toHaveBeenCalledWith(
      'vercel',
      expect.arrayContaining(['inspect', '--logs', deploymentUrl + '/']),
      expect.anything()
    )
  })

  it('uses one build transcript without hiding repeated compiler diagnostics', async () => {
    const next = await instance()
    deployResult.stderr = `${diagnostic}\n${diagnostic}\n`
    logs.stderr = `2026-09-18T19:00:00.000Z  ${diagnostic}\n2026-09-18T19:00:00.001Z  ${diagnostic}\n`
    await expect(next.start()).rejects.toThrow('Failed to deploy project')
    expect(next.cliOutput).toBe(`${diagnostic}\n${diagnostic}\n`)
  })

  it('retains CLI diagnostics when fetched build logs are empty', async () => {
    const next = await instance()
    deployResult.stderr = 'Build command failed'
    logs.stderr = ''
    await expect(next.start()).rejects.toThrow(deployResult.stderr)
    expect(next.cliOutput).toContain(deployResult.stderr)
  })

  it('retains CLI diagnostics when failure happens before a deployment URL is returned', async () => {
    const next = await instance()
    deployResult.stdout = ''
    deployResult.stderr = 'Unauthorized'
    await expect(next.start()).rejects.toThrow('Failed to deploy project')
    expect(next.cliOutput).toBe('Unauthorized')
    expect(execa).not.toHaveBeenCalledWith(
      'vercel',
      expect.arrayContaining(['inspect']),
      expect.anything()
    )
  })

  it('does not treat a canceled deployment as a successful start', async () => {
    const next = await instance()
    logs.stderr = 'Deployment canceled'
    await expect(next.start()).rejects.toThrow('Failed to deploy project')
    expect(next.cliOutput).toContain('Deployment canceled')
  })

  it('retains the deployment error if fetching its logs fails', async () => {
    const next = await instance()
    logs = { exitCode: 2, stdout: '', stderr: 'Invalid arguments' }
    await expect(next.start()).rejects.toMatchObject({
      message: expect.stringContaining('Failed to deploy project'),
      cause: expect.objectContaining({
        message: 'Failed to get build output logs: Invalid arguments',
      }),
    })
  })

  it('loads successful deployment IDs during start', async () => {
    successfulDeployment()
    const next = await instance()
    expect(execa).not.toHaveBeenCalled()
    await next.start()
    expect(next.buildId).toBe('build-id')
    expect(next.deploymentId).toBe('deployment-id')
  })

  it('reuses a deployment for concurrent and subsequent start calls', async () => {
    successfulDeployment()
    const next = await instance()
    await Promise.all([next.start(), next.start()])
    await next.start()
    expect(
      jest.mocked(execa).mock.calls.filter(([, args]) => args?.[0] === 'deploy')
    ).toHaveLength(1)
  })

  it('can retry a failed start without retaining stale failure logs', async () => {
    const next = await instance()
    await expect(next.start()).rejects.toThrow('Failed to deploy project')
    successfulDeployment()
    await next.start()
    expect(next.cliOutput).not.toContain(diagnostic)
    expect(next.buildId).toBe('build-id')
    expect(
      jest.mocked(execa).mock.calls.filter(([, args]) => args?.[0] === 'deploy')
    ).toHaveLength(2)
  })

  it('defers custom deployment scripts and exposes their failed build logs', async () => {
    process.env.NEXT_TEST_DEPLOY_SCRIPT_PATH = 'mock-deploy'
    process.env.NEXT_TEST_DEPLOY_LOGS_SCRIPT_PATH = 'mock-logs'
    const next = await instance()
    expect(execa).not.toHaveBeenCalled()
    await expect(next.start()).rejects.toThrow('Custom deploy script failed')
    expect(next.cliOutput).toContain(diagnostic)
  })

  it('continues loading IDs from successful custom deployments', async () => {
    process.env.NEXT_TEST_DEPLOY_SCRIPT_PATH = 'mock-deploy'
    process.env.NEXT_TEST_DEPLOY_LOGS_SCRIPT_PATH = 'mock-logs'
    successfulDeployment()
    const next = await instance()
    await next.start()
    expect(next.buildId).toBe('build-id')
    expect(next.deploymentId).toBe('deployment-id')
  })

  it('does not replace a custom deployment failure when its logs are unavailable', async () => {
    process.env.NEXT_TEST_DEPLOY_SCRIPT_PATH = 'mock-deploy'
    process.env.NEXT_TEST_DEPLOY_LOGS_SCRIPT_PATH = 'mock-logs'
    customLogs = { exitCode: 1, stdout: '', stderr: 'Logs unavailable' }
    const next = await instance()
    await expect(next.start()).rejects.toMatchObject({
      message: expect.stringContaining('Custom deploy script failed'),
      cause: expect.objectContaining({
        message: expect.stringContaining('Custom deploy logs script failed'),
      }),
    })
  })

  it('attaches to an existing deployment only on start', async () => {
    process.env.NEXT_TEST_DEPLOY_URL = deploymentUrl
    successfulDeployment()
    const next = await instance()
    expect(execa).not.toHaveBeenCalled()
    await next.start()
    expect(next.url).toBe(deploymentUrl + '/')
    expect(next.buildId).toBe('build-id')
    expect(execa).toHaveBeenCalledTimes(1)
    expect(execa).toHaveBeenCalledWith(
      'vercel',
      ['inspect', '--logs', deploymentUrl + '/'],
      expect.anything()
    )
  })

  it('does not run deployment cleanup when start was never called', async () => {
    process.env.NEXT_TEST_CLEANUP_SCRIPT_PATH = 'mock-cleanup'
    const next = await instance()
    await next.destroy()
    expect(execa).not.toHaveBeenCalled()
  })

  it('retains logs when attaching to an existing failed deployment', async () => {
    process.env.NEXT_TEST_DEPLOY_URL = deploymentUrl
    const next = await instance()
    await expect(next.start()).rejects.toThrow(
      'Failed to get build output logs'
    )
    expect(next.cliOutput).toContain(diagnostic)
  })

  it('still cleans up a deployment whose start failed', async () => {
    process.env.NEXT_TEST_CLEANUP_SCRIPT_PATH = 'mock-cleanup'
    const next = await instance()
    await expect(next.start()).rejects.toThrow('Failed to deploy project')
    await next.destroy()
    expect(execa).toHaveBeenCalledWith('mock-cleanup', [], expect.anything())
  })

  describe('polling build logs for the ID markers', () => {
    const ok = (stderr: string): Result => ({ exitCode: 0, stdout: '', stderr })
    const buildOutput = 'Running "pnpm build"\nCompiled successfully\n'

    beforeEach(() => {
      // Pin the setup budget, whose default depends on the platform.
      process.env.NEXT_E2E_TEST_TIMEOUT = '120000'
      successfulDeployment()
    })

    it('fetches the logs once when the markers are already there', async () => {
      installClock()
      const next = await instance()
      await next.start()
      expect(inspectCalls).toHaveLength(1)
      expect(require('console').log).toHaveBeenCalledWith(
        `Found build log markers for ${deploymentUrl} on attempt 1 after 0ms`
      )
    })

    it('keeps polling with backoff until every marker is present', async () => {
      const clock = installClock()
      inspectResults = [
        ok(cliHeader),
        // Only a prefix of the markers has arrived.
        ok(`${cliHeader}BUILD_ID: build-id\nDEPLOYMENT_ID: deployment-id\n`),
      ]
      const next = await instance()
      await next.start()
      expect(next.buildId).toBe('build-id')
      expect(inspectCalls).toHaveLength(3)
      expect(clock.waits).toEqual([2_000, 4_000])
      expect(require('console').log).toHaveBeenCalledWith(
        `Found build log markers for ${deploymentUrl} on attempt 3 after 6000ms`
      )
    })

    it('retries an inspect call that hangs or fails', async () => {
      const clock = installClock()
      inspectResults = [
        hungInspect(clock),
        { exitCode: 1, stdout: '', stderr: 'Error: Internal server error' },
      ]
      const next = await instance()
      await next.start()
      expect(next.buildId).toBe('build-id')
      expect(inspectCalls).toHaveLength(3)
      for (const call of inspectCalls) {
        expect(call.timeout).toBeGreaterThan(0)
        expect(call.timeout).toBeLessThanOrEqual(30_000)
      }
    })

    it('stops at a deadline that leaves headroom before the setup hook timeout', async () => {
      process.env.NEXT_E2E_TEST_TIMEOUT = '60000'
      const clock = installClock(10_000)
      const deployStartedAt = clock.now
      // The deadline is 60s - 20s of headroom after the deploy started.
      const deadline = deployStartedAt + 40_000
      logs = ok(cliHeader)
      const next = await instance()
      await expect(next.start()).rejects.toThrow(
        'Failed to get buildId from logs'
      )
      expect(clock.waits).toEqual([2_000, 4_000, 8_000, 10_000])
      expect(inspectCalls.map((call) => call.at! - deployStartedAt)).toEqual([
        10_000, 12_000, 16_000, 24_000, 34_000,
      ])
      for (const call of inspectCalls) {
        expect(call.at! + call.timeout!).toBeLessThanOrEqual(deadline)
      }
      expect(clock.now).toBeLessThanOrEqual(deadline)
    })

    it('does not start a retry after the deadline when a wait overshoots', async () => {
      process.env.NEXT_E2E_TEST_TIMEOUT = '60000'
      const clock = installClock()
      const deadline = clock.now + 40_000
      clock.oversleepMs = 30_000
      logs = ok(cliHeader)
      const next = await instance()
      await expect(next.start()).rejects.toThrow(
        'Failed to get buildId from logs'
      )
      expect(inspectCalls).toHaveLength(2)
      for (const call of inspectCalls) {
        expect(call.at!).toBeLessThan(deadline)
      }
    })

    it('retries a rejected inspect call without losing earlier logs', async () => {
      process.env.NEXT_E2E_TEST_TIMEOUT = '60000'
      installClock()
      inspectResults = [
        ok(`${cliHeader}${buildOutput}`),
        ...Array.from({ length: 10 }, () => new Error('spawn vercel EAGAIN')),
      ]
      const next = await instance()
      await expect(next.start()).rejects.toThrow('Compiled successfully')
      expect(inspectCalls.length).toBeGreaterThan(2)
    })

    it('recovers from a rejected inspect call', async () => {
      installClock()
      inspectResults = [new Error('spawn vercel EAGAIN')]
      const next = await instance()
      await next.start()
      expect(next.buildId).toBe('build-id')
      expect(inspectCalls).toHaveLength(2)
    })

    it('keeps polling while a marker has a blank value', async () => {
      installClock()
      inspectResults = [
        ok(
          `${cliHeader}BUILD_ID:  \nDEPLOYMENT_ID: deployment-id\nNEXT_SUPPORTS_IMMUTABLE_ASSETS: 1\n`
        ),
      ]
      const next = await instance()
      await next.start()
      expect(next.buildId).toBe('build-id')
      expect(inspectCalls).toHaveLength(2)
    })

    it('makes one attempt when the deadline passed during the deploy', async () => {
      installClock(200_000)
      logs = ok(cliHeader)
      const next = await instance()
      await expect(next.start()).rejects.toThrow(
        'Failed to get buildId from logs'
      )
      expect(inspectCalls).toEqual([
        expect.objectContaining({ timeout: 30_000 }),
      ])
    })

    it('keeps an earlier transcript when a later attempt times out', async () => {
      process.env.NEXT_E2E_TEST_TIMEOUT = '60000'
      const clock = installClock()
      inspectResults = [
        ok(`${cliHeader}${buildOutput}`),
        ...Array.from({ length: 10 }, () => hungInspect(clock)),
      ]
      const next = await instance()
      await expect(next.start()).rejects.toThrow('Compiled successfully')
      expect(inspectCalls.length).toBeGreaterThan(1)
      expect(next.cliOutput).toContain('Compiled successfully')
    })

    it('reports when inspect returned no build-log lines at all', async () => {
      installClock()
      logs = ok(cliHeader)
      const next = await instance()
      const error = await next.start().catch((err: Error) => err)
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toMatch(
        /^Failed to get buildId from logs of https:\/\/fixture\.vercel\.app\/? after \d+ attempt\(s\) in \d+ms: `vercel inspect --logs` returned no build-log lines/
      )
    })

    it('names every marker missing from the build logs', async () => {
      installClock()
      logs = ok(`${cliHeader}${buildOutput}`)
      const next = await instance()
      await expect(next.start()).rejects.toThrow(
        /^Failed to get buildId from logs .*: the build logs are missing the BUILD_ID, DEPLOYMENT_ID, NEXT_SUPPORTS_IMMUTABLE_ASSETS marker\(s\)/
      )
    })

    it('names only the markers that are missing', async () => {
      installClock()
      logs = ok(
        `${cliHeader}${buildOutput}BUILD_ID: build-id\nDEPLOYMENT_ID: deployment-id\n`
      )
      const next = await instance()
      await expect(next.start()).rejects.toThrow(
        'the build logs are missing the NEXT_SUPPORTS_IMMUTABLE_ASSETS marker(s)'
      )
    })

    it('includes why the last inspect call failed', async () => {
      process.env.NEXT_E2E_TEST_TIMEOUT = '60000'
      const clock = installClock()
      inspectResults = Array.from({ length: 10 }, () => hungInspect(clock))
      const next = await instance()
      await expect(next.start()).rejects.toThrow(
        /The last vercel inspect call timed out after \d+ms/
      )
    })
  })

  describe('retrying vercel deploy', () => {
    const fetchFailed: Result = {
      exitCode: 1,
      stdout: '',
      stderr:
        'Vercel CLI 63.1.0\nDeploying vtest314-e2e-tests\nError: fetch failed\n',
    }
    const deployCalls = () =>
      jest.mocked(execa).mock.calls.filter(([, args]) => args?.[0] === 'deploy')

    beforeEach(() => {
      // Pin the setup budget, whose default depends on the platform.
      process.env.NEXT_E2E_TEST_TIMEOUT = '120000'
    })

    it('retries a network error from before a deployment was reported', async () => {
      const clock = installClock()
      successfulDeployment()
      deployResults = [fetchFailed]
      const next = await instance()
      await next.start()
      expect(next.buildId).toBe('build-id')
      expect(deployCalls()).toHaveLength(2)
      expect(clock.waits).toEqual([5_000])
    })

    it('gives up after three attempts', async () => {
      const clock = installClock()
      deployResult = fetchFailed
      const next = await instance()
      await expect(next.start()).rejects.toThrow(
        'Failed to deploy project: Vercel CLI 63.1.0'
      )
      expect(deployCalls()).toHaveLength(3)
      expect(clock.waits).toEqual([5_000, 10_000])
    })

    it('does not retry when too little of the setup budget is left', async () => {
      installClock(40_000)
      deployResult = fetchFailed
      const next = await instance()
      await expect(next.start()).rejects.toThrow('Failed to deploy project')
      expect(deployCalls()).toHaveLength(1)
    })

    it.each([
      ['an authentication error', { stdout: '', stderr: 'Unauthorized' }],
      [
        'a network error after a deployment URL was printed',
        { stdout: deploymentUrl, stderr: 'Error: read ECONNRESET' },
      ],
      [
        'a network error after the Inspect line',
        {
          stdout: '',
          stderr:
            '  Inspect         https://vercel.com/team/project/abc\nError: fetch failed',
        },
      ],
      ['a build failure', { stdout: deploymentUrl, stderr: 'Build failed' }],
      [
        'a build diagnostic that mentions fetch failed',
        {
          stdout: '',
          stderr: 'Build failed\n  TypeError: fetch failed\n    at prerender\n',
        },
      ],
      [
        'an authentication error next to a network error',
        { stdout: '', stderr: 'Error: Unauthorized\nError: fetch failed\n' },
      ],
      [
        'a network error after an ANSI-colored Inspect line',
        {
          stdout: '',
          stderr:
            '\x1b[2K\x1b[G  Inspect         \x1b[36mhttps://vercel.com/team/project/abc\x1b[39m\nError: fetch failed',
        },
      ],
    ])('does not retry %s', async (_, output) => {
      installClock()
      deployResult = { exitCode: 1, ...output }
      const next = await instance()
      await expect(next.start()).rejects.toThrow('Failed to deploy project')
      expect(deployCalls()).toHaveLength(1)
    })
  })
})
