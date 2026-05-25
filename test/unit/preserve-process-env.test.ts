import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { loadEnvConfig, resetEnv } from '../../packages/next-env/'

describe('preserve process env', () => {
  let tempDir: string | undefined

  afterEach(() => {
    resetEnv()
    delete process.env.__NEXT_PROCESSED_ENV

    if (tempDir) {
      rmSync(tempDir, { force: true, recursive: true })
      tempDir = undefined
    }
  })

  it('should reload env files when dir changes without forceReload', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'next-env-config-'))

    const firstDir = join(tempDir, 'app-a')
    const secondDir = join(tempDir, 'app-b')

    mkdirSync(firstDir, { recursive: true })
    mkdirSync(secondDir, { recursive: true })

    writeFileSync(join(firstDir, '.env'), 'FROM_APP=app-a\nSHARED=first\n')
    writeFileSync(join(secondDir, '.env'), 'FROM_APP=app-b\nSHARED=second\n')

    const first = loadEnvConfig(firstDir)
    const second = loadEnvConfig(secondDir)

    expect(first.parsedEnv).toEqual({ FROM_APP: 'app-a', SHARED: 'first' })
    expect(second.parsedEnv).toEqual({ FROM_APP: 'app-b', SHARED: 'second' })
    expect(second.loadedEnvFiles).toHaveLength(1)
    expect(second.loadedEnvFiles[0].contents).toContain('FROM_APP=app-b')
    expect(process.env.FROM_APP).toBe('app-b')
    expect(process.env.SHARED).toBe('second')
  })

  it('should not reassign `process.env`', () => {
    const originalProcessEnv = process.env
    loadEnvConfig('.')
    expect(Object.is(originalProcessEnv, process.env)).toBeTrue()
  })
})
