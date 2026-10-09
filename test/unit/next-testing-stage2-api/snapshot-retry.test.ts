import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'

it('runs the pinned snapshot rollback regression in a fresh realm', async () => {
  const { stdout } = await promisify(execFile)(process.execPath, [
    '--test-reporter=tap',
    '--import',
    require.resolve('tsx'),
    join(__dirname, 'snapshot-retry.ts'),
  ]).catch((error) => {
    throw new Error([error.message, error.stdout, error.stderr].join('\n'))
  })
  expect(stdout).toContain('# tests 1')
  expect(stdout).toContain('# fail 0')
}, 30000)
