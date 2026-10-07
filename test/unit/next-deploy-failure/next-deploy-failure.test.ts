import execa from 'execa'
import { trace } from 'next/dist/trace'

jest.mock('execa', () => jest.fn())

// File collection touches the real test directory, which the mocked
// createTestDir never sets up. Uploads and deployments go through the mocked
// fetch instead.
jest.mock('../../lib/vercel-api', () => {
  const actual = jest.requireActual('../../lib/vercel-api')
  return {
    ...actual,
    collectDeploymentFiles: jest.fn(async () => [
      { file: 'package.json', sha: 'sha', size: 2, data: Buffer.from('{}') },
    ]),
  }
})

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
type Result = { exitCode: number; stdout: string; stderr: string }
type DeployOutcome =
  // The deployment request itself failed; no deployment exists.
  | { kind: 'request-error'; status: number; body: string }
  // The deployment was created but reached a non-READY terminal state.
  | {
      kind: 'not-ready'
      readyState: 'ERROR' | 'CANCELED'
      errorMessage: string
    }
  | { kind: 'ready' }

describe('deployment lifecycle', () => {
  let deployOutcome: DeployOutcome
  let logsResult: { status: number; text: string }
  let deployResult: Result
  let customLogs: Result

  beforeEach(() => {
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
      // The deploy setup requires a Vercel access token; in CI it is vended
      // by vercel/authenticate-cli-action.
      VERCEL_TOKEN: 'test-unit-token',
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
      .spyOn(NextDeployInstance.prototype as any, 'configureProxyAddress')
      .mockResolvedValue(undefined)

    deployOutcome = { kind: 'not-ready', readyState: 'ERROR', errorMessage: '' }
    logsResult = { status: 200, text: diagnostic }
    deployResult = { exitCode: 1, stdout: deploymentUrl, stderr: '' }
    customLogs = { exitCode: 0, stdout: '', stderr: diagnostic }

    jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      const method = init?.method ?? 'GET'

      if (method === 'POST' && url.includes('/v2/files')) {
        return new Response('{}', { status: 200 })
      }
      if (method === 'POST' && url.includes('/v13/deployments')) {
        if (deployOutcome.kind === 'request-error') {
          return new Response(deployOutcome.body, {
            status: deployOutcome.status,
          })
        }
        return Response.json(
          { id: 'dpl_fixture', url: 'fixture.vercel.app' },
          { status: 200 }
        )
      }
      if (method === 'GET' && url.includes('/v13/deployments/')) {
        if (deployOutcome.kind === 'ready') {
          return Response.json({ readyState: 'READY' }, { status: 200 })
        }
        if (deployOutcome.kind === 'not-ready') {
          return Response.json(
            {
              readyState: deployOutcome.readyState,
              errorMessage: deployOutcome.errorMessage,
            },
            { status: 200 }
          )
        }
      }
      if (method === 'GET' && url.includes('/events')) {
        if (logsResult.status === 200) {
          return Response.json(
            logsResult.text === ''
              ? []
              : [
                  {
                    type: 'stdout',
                    created: 0,
                    payload: { text: logsResult.text },
                  },
                ],
            { status: 200 }
          )
        }
        return new Response(logsResult.text, { status: logsResult.status })
      }
      throw new Error(`Unexpected request: ${method} ${url}`)
    })

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
        } else {
          throw new Error('Unexpected subprocess')
        }
        return Promise.resolve(result) as unknown as ReturnType<typeof execa>
      })
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

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
    deployOutcome = { kind: 'ready' }
    logsResult = { status: 200, text: ids }
    deployResult = { exitCode: 0, stdout: deploymentUrl, stderr: '' }
    customLogs = { exitCode: 0, stdout: '', stderr: ids }
  }

  function deploymentCreations() {
    return jest
      .mocked(fetch)
      .mock.calls.filter(
        ([input, init]) =>
          String(input).includes('/v13/deployments') &&
          (init?.method ?? 'GET') === 'POST'
      )
  }

  function buildLogFetches() {
    return jest
      .mocked(fetch)
      .mock.calls.filter(([input]) => String(input).includes('/events'))
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
    deployOutcome = {
      kind: 'not-ready',
      readyState: 'ERROR',
      errorMessage: 'Build command failed',
    }
    await expect(next.start()).rejects.toThrow('Failed to deploy project')
    expect(next.cliOutput).not.toContain('Build command failed')
    expect(next.cliOutput).toContain(diagnostic)
    expect(next.buildId).toBeUndefined()
    expect(next.url).toBe(deploymentUrl + '/')
    expect(
      buildLogFetches().some(([input]) =>
        String(input).includes('/v2/deployments/dpl_fixture/events')
      )
    ).toBe(true)
  })

  it('uses one build transcript without hiding repeated compiler diagnostics', async () => {
    const next = await instance()
    logsResult = { status: 200, text: `${diagnostic}\n${diagnostic}\n` }
    await expect(next.start()).rejects.toThrow('Failed to deploy project')
    expect(next.cliOutput).toBe(`${diagnostic}\n${diagnostic}\n`)
  })

  it('retains the deployment error when fetched build logs are empty', async () => {
    const next = await instance()
    deployOutcome = {
      kind: 'not-ready',
      readyState: 'ERROR',
      errorMessage: 'Build command failed',
    }
    logsResult = { status: 200, text: '' }
    await expect(next.start()).rejects.toThrow('Build command failed')
    expect(next.cliOutput).toContain('Build command failed')
  })

  it('retains the API error when failure happens before a deployment is created', async () => {
    const next = await instance()
    deployOutcome = { kind: 'request-error', status: 401, body: 'Unauthorized' }
    await expect(next.start()).rejects.toThrow('Failed to deploy project')
    expect(next.cliOutput).toBe('Unauthorized')
    expect(buildLogFetches()).toHaveLength(0)
  })

  it('does not treat a canceled deployment as a successful start', async () => {
    const next = await instance()
    deployOutcome = {
      kind: 'not-ready',
      readyState: 'CANCELED',
      errorMessage: '',
    }
    logsResult = { status: 200, text: 'Deployment canceled' }
    await expect(next.start()).rejects.toThrow('Failed to deploy project')
    expect(next.cliOutput).toContain('Deployment canceled')
  })

  it('retains the deployment error if fetching its logs fails', async () => {
    const next = await instance()
    logsResult = { status: 500, text: 'Invalid arguments' }
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
    expect(deploymentCreations()).toHaveLength(1)
  })

  it('can retry a failed start without retaining stale failure logs', async () => {
    const next = await instance()
    await expect(next.start()).rejects.toThrow('Failed to deploy project')
    successfulDeployment()
    await next.start()
    expect(next.cliOutput).not.toContain(diagnostic)
    expect(next.buildId).toBe('build-id')
    expect(deploymentCreations()).toHaveLength(2)
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
    expect(
      buildLogFetches().some(([input]) =>
        String(input).includes('/v2/deployments/fixture.vercel.app/events')
      )
    ).toBe(true)
  })

  it('does not run deployment cleanup when start was never called', async () => {
    process.env.NEXT_TEST_CLEANUP_SCRIPT_PATH = 'mock-cleanup'
    const next = await instance()
    await next.destroy()
    expect(execa).not.toHaveBeenCalled()
  })

  it('retains logs when attaching to an existing failed deployment', async () => {
    process.env.NEXT_TEST_DEPLOY_URL = deploymentUrl
    logsResult = { status: 500, text: diagnostic }
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
})
