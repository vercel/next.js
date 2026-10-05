import { runInNewContext } from 'vm'
import { getDeploymentTestEnvAssignments } from '../../lib/e2e-utils/deployment-test-env'

describe.each([
  '__NEXT_CACHE_COMPONENTS',
  '__NEXT_PARTIAL_PREFETCHING',
  '__NEXT_EXPERIMENTAL_CACHED_NAVIGATIONS',
])('deployment capture of %s', (flag) => {
  beforeEach(() => {
    jest.replaceProperty(process, 'env', {
      ...process.env,
      __NEXT_CACHE_COMPONENTS: '',
      __NEXT_PARTIAL_PREFETCHING: '',
      __NEXT_EXPERIMENTAL_CACHED_NAVIGATIONS: '',
    })
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it.each(['true', 'false', '0', '"; process.env.INJECTED = "yes"; //\n\\'])(
    'restores the literal value %j in the deployed process',
    (value) => {
      process.env[flag] = value
      const env: Record<string, string> = {}

      runInNewContext(getDeploymentTestEnvAssignments(), { process: { env } })

      expect(env).toEqual({ [flag]: value })
    }
  )

  it.each(['', undefined])(
    'leaves the deployed environment unchanged when the local flag is %j',
    (value) => {
      if (value === undefined) delete process.env[flag]
      else process.env[flag] = value
      const env = { [flag]: 'deployment-value' }

      runInNewContext(getDeploymentTestEnvAssignments(), { process: { env } })

      expect(env).toEqual({ [flag]: 'deployment-value' })
    }
  )

  it('captures the value when generating the config, without needing a remote alias', () => {
    process.env[flag] = 'true'
    const assignments = getDeploymentTestEnvAssignments()
    process.env[flag] = 'false'
    const env: Record<string, string> = {}

    runInNewContext(assignments, { process: { env } })

    expect(env[flag]).toBe('true')
  })
})

it('does not copy unrelated environment variables into the config', () => {
  jest.replaceProperty(process, 'env', {
    ...process.env,
    __NEXT_CACHE_COMPONENTS: 'true',
    UNRELATED_TEST_ENV: 'local-value',
  })
  try {
    const env = { UNRELATED_TEST_ENV: 'deployment-value' }

    runInNewContext(getDeploymentTestEnvAssignments(), { process: { env } })

    expect(env.UNRELATED_TEST_ENV).toBe('deployment-value')
  } finally {
    jest.restoreAllMocks()
  }
})
