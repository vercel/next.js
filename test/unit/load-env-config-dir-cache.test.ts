import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { loadEnvConfig } from '../../packages/next-env/'

function makeTempDir(envContents?: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'next-env-test-'))
  if (envContents !== undefined) {
    fs.writeFileSync(path.join(dir, '.env'), envContents)
  }
  return dir
}

afterEach(() => {
  // Reset module-level cache between tests
  loadEnvConfig(os.tmpdir(), false, undefined, true)
})

describe('loadEnvConfig dir cache key', () => {
  it('loads env from new dir when dir changes between calls', () => {
    const emptyDir = makeTempDir()
    const envDir = makeTempDir('DATABASE_URL=postgres://test')

    // First call: dir with no .env (simulates Next.js internal call with app dir)
    // Snapshot values immediately — combinedEnv is process.env by reference
    // and will reflect mutations from subsequent calls
    const r1 = loadEnvConfig(emptyDir, false, undefined, true)
    const r1FileCount = r1.loadedEnvFiles.length
    const r1Url = r1.combinedEnv.DATABASE_URL

    // Second call: different dir that has a .env (simulates user envConfig.ts with monorepo root)
    // Before the fix this would return the stale cached empty result
    const r2 = loadEnvConfig(envDir)

    expect(r1FileCount).toBe(0)
    expect(r1Url).toBeUndefined()
    expect(r2.loadedEnvFiles).toHaveLength(1)
    expect(r2.combinedEnv.DATABASE_URL).toBe('postgres://test')
  })

  it('returns cached result when the same dir is called twice', () => {
    const envDir = makeTempDir('DATABASE_URL=postgres://cached')

    const r1 = loadEnvConfig(envDir, false, undefined, true)
    expect(r1.combinedEnv.DATABASE_URL).toBe('postgres://cached')

    // Write a different value to the .env — cache should prevent re-read
    fs.writeFileSync(
      path.join(envDir, '.env'),
      'DATABASE_URL=postgres://updated'
    )

    const r2 = loadEnvConfig(envDir)
    expect(r2.combinedEnv.DATABASE_URL).toBe('postgres://cached')
  })
})
