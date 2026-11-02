import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

it('invalidates modules without evicting shared children or using deprecated APIs on Node.js >20', () => {
  const nodeArgs = ['--pending-deprecation']
  if (Number.parseInt(process.versions.node, 10) > 20) {
    nodeArgs.push('--throw-deprecation')
  }

  const result = spawnSync(
    process.execPath,
    [
      ...nodeArgs,
      join(__dirname, 'fixtures/require-cache/check.cjs'),
      require.resolve('next/dist/server/dev/require-cache'),
    ],
    { encoding: 'utf8' }
  )

  expect(result.error).toBeUndefined()
  expect(result.stdout).toBe('cache invalidation passed\n')
  expect(result.status).toBe(0)
  if (Number.parseInt(process.versions.node, 10) > 20) {
    expect(result.stderr).not.toContain('[DEP0144]')
  } else {
    expect(result.stderr).toContain('[DEP0144]')
  }
})
