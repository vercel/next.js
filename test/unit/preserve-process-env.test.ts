import {
  loadEnvConfig,
  resetEnv,
  updateInitialEnv,
} from '../../packages/next-env/'

describe('preserve process env', () => {
  it('should not reassign `process.env`', () => {
    const originalProcessEnv = process.env
    loadEnvConfig('.')
    expect(Object.is(originalProcessEnv, process.env)).toBeTrue()
  })

  it('should remove values unset in the initial env snapshot', () => {
    const key = '__NEXT_TEST_UNSET_INITIAL_ENV'

    try {
      loadEnvConfig('.')
      process.env[key] = 'changed'
      updateInitialEnv({ [key]: undefined })

      resetEnv()

      expect(process.env[key]).toBeUndefined()
    } finally {
      delete process.env[key]
    }
  })
})
