import execa from 'execa'
import { trace } from 'next/dist/trace'

jest.mock('execa', () => jest.fn())

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

describe('deployment lifecycle', () => {
  let deployResult: Result
  let logs: Result
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
              result = deployResult
              break
            case 'inspect':
              result = logs
              break
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
})
