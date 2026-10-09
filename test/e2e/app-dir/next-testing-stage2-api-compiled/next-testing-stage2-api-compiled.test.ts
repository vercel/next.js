import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const invoke = (filter: string, color = false) =>
  promisify(execFile)(
    process.execPath,
    [
      require.resolve('next/dist/bin/next'),
      'test',
      __dirname,
      '--run',
      '--filter',
      filter,
    ],
    {
      env: {
        ...process.env,
        NODE_ENV: 'development',
        NEXT_TELEMETRY_DISABLED: '1',
        FORCE_COLOR: color ? '1' : '0',
      },
    }
  )

it('executes lifecycle callbacks in actual compiled Next test entries', async () => {
  const { stdout, stderr } = await invoke('lifecycle.case')
  expect(stdout).toMatch(/Tests\s+2 passed \(2\)/)
  expect(stdout + stderr).not.toContain('expected first-attempt failure')
  expect(stderr).not.toContain('Failed Tests')
  expect(stdout).not.toContain('\x1b[')
}, 120000)

it('retains snapshot bytes and reports listener errors when the compiled case fails', async () => {
  const path = join(__dirname, 'cases/__snapshots__/failure.case.ts.snap')
  const original = await readFile(path, 'utf8')
  const result = await invoke('failure.case', true).then(
    () => {
      throw new Error('Expected the actual compiled test to fail.')
    },
    (error) => error
  )
  expect(result.code).toBe(1)
  expect(result.stdout).toContain('\x1b[')
  expect(result.stderr).toContain('Failed Tests')
  expect(result.stdout + result.stderr).toContain(
    'C2_FAILURE_LISTENER_EXECUTED'
  )
  expect(result.stdout + result.stderr).toContain('failure listener retained')
  expect(await readFile(path, 'utf8')).toBe(original)
}, 120000)
