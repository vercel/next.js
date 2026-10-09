import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'

it('runs stage two API conformance against built Next in a fresh realm', async () => {
  const { stdout } = await promisify(execFile)(process.execPath, [
    '--test-reporter=tap',
    '--import',
    require.resolve('tsx'),
    join(__dirname, 'cases.ts'),
  ]).catch((error) => {
    throw new Error([error.message, error.stdout, error.stderr].join('\n'))
  })
  expect(stdout).toContain('# tests 15')
  expect(stdout).toContain('# fail 0')
}, 30000)
