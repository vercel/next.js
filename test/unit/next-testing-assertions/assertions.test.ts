import { createAttemptUtilities } from 'next/dist/experimental/testing/assertions/utilities'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'

it('runs the assertion conformance cases in a fresh realm', async () => {
  // Jest owns a nonconfigurable matcher symbol in its realm. The actual Next
  // execution host likewise gives the compatibility API a fresh process.
  const { stdout } = await promisify(execFile)(process.execPath, [
    '--test-reporter=tap',
    '--import',
    require.resolve('tsx'),
    join(__dirname, 'cases.ts'),
  ]).catch((error) => {
    throw new Error([error.message, error.stdout, error.stderr].join('\n'))
  })
  expect(stdout).toContain('# tests 34')
  expect(stdout).toContain('# fail 0')
}, 30000)

it('owns and cancels waitUntil after repeated falsy callbacks', async () => {
  const utilities = createAttemptUtilities(() => {})
  let polled!: () => void
  const repeated = new Promise<void>((resolve) => {
    polled = resolve
  })
  let calls = 0
  const pending = utilities.waitUntil(
    () => {
      if (++calls === 2) polled()
      return false
    },
    { interval: 1, timeout: 5000 }
  )
  // eslint-disable-next-line jest/valid-expect -- Arm cancellation before disposal; the assertion is awaited below.
  const rejected = expect(pending).rejects.toThrow(
    'cancelled during file cleanup'
  )
  try {
    await repeated
  } finally {
    utilities.dispose()
  }
  await rejected
})
