import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { loadEnvConfig } from '../../packages/next-env/'

describe('loadEnvConfig - dir cache key', () => {
  let tmpDir1: string
  let tmpDir2: string

  beforeEach(() => {
    tmpDir1 = fs.mkdtempSync(path.join(os.tmpdir(), 'next-env-test-1-'))
    tmpDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'next-env-test-2-'))
    // Write distinct .env files in each directory
    fs.writeFileSync(path.join(tmpDir1, '.env'), 'FIRST_DIR_VAR=from-dir1')
    fs.writeFileSync(path.join(tmpDir2, '.env'), 'SECOND_DIR_VAR=from-dir2')
  })

  afterEach(() => {
    fs.rmSync(tmpDir1, { recursive: true, force: true })
    fs.rmSync(tmpDir2, { recursive: true, force: true })
  })

  it('should load env from a different directory when called with forceReload', () => {
    // First call - loads from dir1
    loadEnvConfig(tmpDir1, false, console, true)
    expect(process.env.FIRST_DIR_VAR).toBe('from-dir1')

    // Second call - different dir with forceReload
    loadEnvConfig(tmpDir2, false, console, true)
    expect(process.env.SECOND_DIR_VAR).toBe('from-dir2')
  })

  it('should not ignore dir argument when called without forceReload but with a different dir', () => {
    // Simulate Next.js pre-loading dir1 internally
    loadEnvConfig(tmpDir1, false, console, true)
    expect(process.env.FIRST_DIR_VAR).toBe('from-dir1')

    // User code calls with a different dir - should NOT return cached dir1 result
    const { loadedEnvFiles } = loadEnvConfig(tmpDir2, false, console, false)
    expect(loadedEnvFiles.some((f) => f.path === '.env')).toBe(true)
    expect(process.env.SECOND_DIR_VAR).toBe('from-dir2')
  })

  it('should use cache when called with the same dir and without forceReload', () => {
    loadEnvConfig(tmpDir1, false, console, true)
    expect(process.env.FIRST_DIR_VAR).toBe('from-dir1')

    // Same dir - should use cache
    const { loadedEnvFiles } = loadEnvConfig(tmpDir1, false, console, false)
    expect(loadedEnvFiles.some((f) => f.path === '.env')).toBe(true)
  })
})
