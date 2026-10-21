import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'

it('composes snapshots with original assertion and publication ownership', async () => {
  const { stdout } = await promisify(execFile)(process.execPath, [
    '--test-reporter=tap',
    '--import',
    require.resolve('tsx'),
    join(__dirname, 'runtime.ts'),
  ]).catch((error) => {
    throw new Error([error.message, error.stdout, error.stderr].join('\n'))
  })
  expect(stdout).toContain('# tests 5')
  expect(stdout).toContain('# pass 5')
  expect(stdout).toContain('# fail 0')
}, 30000)
