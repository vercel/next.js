import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'

it.each(['node', 'browser'])(
  'retains the original %s primitive attempt carrier across actual Test rebinding',
  async (mode) => {
    const { stdout, stderr } = await promisify(execFile)(process.execPath, [
      join(__dirname, 'task-runtime-integration.cjs'),
      process.cwd(),
      mode,
    ])
    expect(stderr).toBe('')
    expect(JSON.parse(stdout)).toEqual({
      mode,
      capturedOutcomes: 3,
      manualUnchanged: true,
      lookupReads: 0,
    })
  },
  30000
)

it.each(['node', 'browser'] as const)(
  'publishes genuine native public Promise queues through the %s primitive with captured private ownership',
  async (mode) => {
    const { stdout, stderr } = await promisify(execFile)(
      process.execPath,
      [
        join(__dirname, 'native-public-promises-primitive.cjs'),
        join(__dirname, '../../..'),
        mode,
      ],
      { timeout: 10000, maxBuffer: 4 * 1024 * 1024 }
    )
    expect(stderr).toBe('')
    const result = JSON.parse(stdout)
    expect(result.mode).toBe(mode)
    expect(result.controls).toBe(11)
  }
)

it.each(['node', 'browser'])(
  'captures the exact native finished callback without replacing its public array: %s',
  async (mode) => {
    const { stdout, stderr } = await promisify(execFile)(
      process.execPath,
      [
        join(__dirname, 'public-finished-producer.cjs'),
        mode,
        require.resolve(
          mode === 'browser'
            ? 'next/dist/compiled/next-test-primitives/browser'
            : 'next/dist/compiled/next-test-primitives'
        ),
      ],
      { timeout: 15000, maxBuffer: 4 * 1024 * 1024 }
    )
    expect(stderr).toBe('')
    const result = JSON.parse(stdout)
    expect(result.mode).toBe(mode)
    expect(result.controls).toBe(11)
    expect(result.failures).toBe(0)
  },
  20000
)
