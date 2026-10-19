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

it('matches genuine unreachable errors, counts, lifetime and public never types', async () => {
  const { stdout } = await promisify(execFile)(process.execPath, [
    '--test-reporter=tap',
    '--import',
    require.resolve('tsx'),
    join(__dirname, 'unreachable-integration.ts'),
  ]).catch((error) => {
    throw new Error([error.message, error.stdout, error.stderr].join('\n'))
  })
  expect(stdout).toContain('# tests 4')
  expect(stdout).toContain('# pass 4')
  expect(stdout).toContain('# fail 0')
}, 30000)

it.each(['browser', 'node'])(
  'preserves %s assertion Promise payloads and present protocol guards',
  async (mode) => {
    const { mkdtemp, readFile, rm } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const directory = await mkdtemp(
      join(tmpdir(), `next-assertion-then-${mode}-`)
    )
    const output = join(directory, 'observations.json')
    try {
      const { stdout, stderr } = await promisify(execFile)(process.execPath, [
        join(__dirname, 'assertion-then-integration.cjs'),
        process.cwd(),
        mode,
        '-',
        output,
      ]).catch(async (error) => {
        const observations = await readFile(output, 'utf8').catch(() => '')
        throw new Error(
          [error.message, error.stdout, error.stderr, observations].join('\n')
        )
      })
      expect(stderr).toBe('')
      const observations = JSON.parse(await readFile(output, 'utf8'))
      console.log(JSON.stringify({ assertionProtocol: observations, stdout }))
      expect(observations.failure).toBeUndefined()
      expect(observations.mode).toBe(mode)
      expect(observations.rows.length).toBeGreaterThan(0)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  },
  30000
)
