import execa from 'execa'
import { trace } from 'next/dist/trace'

jest.mock('execa', () => jest.fn())

// Initialize the real harness in deploy mode, without running a deployment.
const originalMode = process.env.NEXT_TEST_MODE
process.env.NEXT_TEST_MODE = 'deploy'
require('../../lib/e2e-utils')
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

describe('expected deployment failures', () => {
  let deployResult: Result
  let inspection: Result
  let logs: Result

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
    jest.spyOn(NextInstance.prototype, 'setup').mockResolvedValue()
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
    inspection = {
      exitCode: 1,
      stdout: JSON.stringify({ readyState: 'ERROR' }),
      stderr: '',
    }
    logs = { exitCode: 1, stdout: '', stderr: diagnostic }

    jest
      .mocked(execa)
      .mockReset()
      .mockImplementation((command, args) => {
        let result: Result
        if (command === 'mock-deploy') {
          result = deployResult
        } else if (command === 'mock-logs') {
          result = { ...logs, exitCode: 0 }
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
              result = args.includes('--logs') ? logs : inspection
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

  function instance(expectDeploymentFailure = true) {
    return new NextDeployInstance({ files: __dirname, expectDeploymentFailure })
  }

  it('exposes a failed Vercel build without requiring successful-build markers', async () => {
    const next = instance()
    await next.setup(trace('test'))
    expect(next.cliOutput).toBe(diagnostic)
    expect(next.url).toBe(deploymentUrl + '/')
    expect(execa).toHaveBeenCalledWith(
      'vercel',
      expect.arrayContaining(['inspect', '--logs', deploymentUrl + '/']),
      expect.anything()
    )
  })

  it('rejects an unexpectedly successful deployment', async () => {
    deployResult.exitCode = 0
    await expect(instance().setup(trace('test'))).rejects.toThrow(
      'Expected deployment to fail, but it succeeded'
    )
  })

  it('does not accept failure before a deployment URL was returned', async () => {
    deployResult.stdout = ''
    await expect(instance().setup(trace('test'))).rejects.toThrow(
      'Failed deployment did not return a valid URL'
    )
  })

  it('does not accept a canceled deployment', async () => {
    inspection.stdout = JSON.stringify({ readyState: 'CANCELED' })
    await expect(instance().setup(trace('test'))).rejects.toThrow(
      'Expected deployment state ERROR, received CANCELED'
    )
  })

  it('does not accept a failure to inspect the deployment', async () => {
    inspection = { exitCode: 1, stdout: '', stderr: 'Unauthorized' }
    await expect(instance().setup(trace('test'))).rejects.toThrow(
      'Failed to inspect expected failed deployment: Unauthorized'
    )
  })

  it('does not accept an invalid log-query invocation', async () => {
    logs = { exitCode: 2, stdout: '', stderr: 'Invalid arguments' }
    await expect(instance().setup(trace('test'))).rejects.toThrow(
      'Failed to get build output logs: Invalid arguments'
    )
  })

  it('continues rejecting failed deployments by default', async () => {
    await expect(instance(false).setup(trace('test'))).rejects.toThrow(
      'Failed to deploy project'
    )
    expect(execa).not.toHaveBeenCalledWith(
      'vercel',
      expect.arrayContaining(['inspect']),
      expect.anything()
    )
  })

  it('continues loading successful deployment IDs by default', async () => {
    deployResult.exitCode = 0
    logs = { exitCode: 0, stdout: '', stderr: ids }
    const next = instance(false)
    await next.setup(trace('test'))
    expect(next.buildId).toBe('build-id')
    expect(next.deploymentId).toBe('deployment-id')
  })

  it('accepts a custom deployment script failure and reads its build logs', async () => {
    process.env.NEXT_TEST_DEPLOY_SCRIPT_PATH = 'mock-deploy'
    process.env.NEXT_TEST_DEPLOY_LOGS_SCRIPT_PATH = 'mock-logs'
    const next = instance()
    await next.setup(trace('test'))
    expect(next.cliOutput).toBe(diagnostic)
  })

  it('rejects an unexpectedly successful custom deployment', async () => {
    process.env.NEXT_TEST_DEPLOY_SCRIPT_PATH = 'mock-deploy'
    process.env.NEXT_TEST_DEPLOY_LOGS_SCRIPT_PATH = 'mock-logs'
    deployResult.exitCode = 0
    await expect(instance().setup(trace('test'))).rejects.toThrow(
      'Expected deployment to fail, but it succeeded'
    )
  })

  it('requires a new deployment to test an expected build failure', async () => {
    process.env.NEXT_TEST_DEPLOY_URL = deploymentUrl
    await expect(instance().setup(trace('test'))).rejects.toThrow(
      'expectDeploymentFailure requires a new deployment'
    )
  })
})
