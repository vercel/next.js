import { loadEnvConfig } from '../../packages/next-env/'

describe('preserve process env', () => {
  it('should not reassign `process.env`', () => {
    const originalProcessEnv = process.env
    loadEnvConfig('.')
    expect(Object.is(originalProcessEnv, process.env)).toBeTrue()
  })
})
