import { join } from 'node:path'

it('preserves the complete Browser Chai facade golden with an explicit plugin receiver', async () => {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [
      '--test-reporter=tap',
      '--import',
      require.resolve('tsx'),
      join(__dirname, 'component.ts'),
    ],
    { timeout: 20000 }
  )
  expect(stdout).toContain('# tests 1')
  expect(stdout).toContain('# pass 1')
  expect(stdout).toContain('# fail 0')
  expect(stdout).toContain('"proxy-plugin"')
  expect(stdout).toContain('"pluginCalls":1')
}, 30000)
