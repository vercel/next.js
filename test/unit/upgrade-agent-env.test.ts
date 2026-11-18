import { stripNodeEnv } from 'next/dist/lib/upgrade/agent-env'

describe('stripNodeEnv', () => {
  it('removes NODE_ENV while preserving other variables', () => {
    const env = stripNodeEnv({
      NODE_ENV: 'development',
      PATH: '/usr/bin',
      CUSTOM_FLAG: '1',
    })

    expect(env).toEqual({ PATH: '/usr/bin', CUSTOM_FLAG: '1' })
    expect('NODE_ENV' in env).toBe(false)
  })

  it('composes with the extra variables the upgrade delegation adds', () => {
    // Mirrors the env built for the delegated upgrade CLI: the sanitized
    // parent env plus the __NEXT_* markers, with no NODE_ENV leaking from
    // a parent `next dev` process.
    const env = {
      ...stripNodeEnv({ NODE_ENV: 'development', KEEP_ME: 'yes' }),
      __NEXT_AGENT_UPGRADE_RUN_ID: 'run-id',
      __NEXT_UPGRADE_EXPECTED_CLI_VERSION: '16.6.0-canary.1',
      __NEXT_UPGRADE_USE_CURRENT_CLI: '1',
    }

    expect(env.NODE_ENV).toBeUndefined()
    expect(env.KEEP_ME).toBe('yes')
    expect(env.__NEXT_AGENT_UPGRADE_RUN_ID).toBe('run-id')
    expect(env.__NEXT_UPGRADE_EXPECTED_CLI_VERSION).toBe('16.6.0-canary.1')
    expect(env.__NEXT_UPGRADE_USE_CURRENT_CLI).toBe('1')
  })

  it('does not mutate the input env', () => {
    const input = { NODE_ENV: 'development', FOO: 'bar' }
    stripNodeEnv(input)
    expect(input).toEqual({ NODE_ENV: 'development', FOO: 'bar' })
  })

  it('leaves an env without NODE_ENV unchanged', () => {
    expect(stripNodeEnv({ FOO: 'bar' })).toEqual({ FOO: 'bar' })
  })
})
