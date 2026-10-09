import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { promisify } from 'node:util'

it('preserves actual C late-scope reporting across browser facade disposal', async () => {
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [
      '--test-reporter=tap',
      '--import',
      require.resolve('tsx'),
      join(__dirname, 'browser-late.ts'),
      require.resolve('next/dist/experimental/testing/runner'),
      require.resolve('next/dist/experimental/testing/browser'),
    ],
    { timeout: 10_000 }
  ).catch((error) => {
    throw new Error([error.message, error.stdout, error.stderr].join('\n'))
  })
  expect(stdout).toContain('# tests 2')
  expect(stdout).toContain('# fail 0')
}, 15_000)
