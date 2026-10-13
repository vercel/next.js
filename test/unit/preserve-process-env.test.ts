import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import {
  loadEnvConfig,
  resetEnv,
  updateInitialEnv,
} from '../../packages/next-env/'

const execFileAsync = promisify(execFile)

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

describe('@next/env package exports', () => {
  it('supports CommonJS and ESM imports', async () => {
    const cjs = await execFileAsync(
      process.execPath,
      [
        '-e',
        `const env = require('@next/env'); console.log(typeof env.loadEnvConfig)`,
      ],
      { encoding: 'utf8' }
    )
    const esm = await execFileAsync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import { initialEnv, loadEnvConfig, processEnv, resetEnv, updateInitialEnv } from '@next/env'; console.log([loadEnvConfig, processEnv, resetEnv, updateInitialEnv].every((value) => typeof value === 'function')); loadEnvConfig(process.cwd()); console.log(typeof initialEnv)`,
      ],
      { encoding: 'utf8' }
    )

    expect(cjs.stdout.trim()).toBe('function')
    expect(esm.stdout.trim()).toBe('true\nobject')
  })
})
