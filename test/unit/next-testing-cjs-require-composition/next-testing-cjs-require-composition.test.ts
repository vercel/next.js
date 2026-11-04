import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

it.each([
  'base',
  'lazy',
  'missing-fields',
  'production-base',
  'production-lazy',
  'reset',
  'reset-async-arrow',
  'reset-async-function',
  'reset-consumer-cycle',
  'reset-multiple-consumers',
])(
  'preserves original CommonJS require alongside an ESM factory: %s',
  async (variant) => {
    const temporary = await mkdtemp(join(tmpdir(), 'next-cjs-composition-'))
    let complete = false
    try {
      const output = join(temporary, 'evidence')
      await promisify(execFile)(
        process.execPath,
        [
          join(__dirname, 'verify.mjs'),
          join(__dirname, '../../..'),
          output,
          variant,
          '--source',
        ],
        { timeout: 150000, maxBuffer: 1024 * 1024 }
      )
      const result = JSON.parse(
        await readFile(join(output, 'RESULT.json'), 'utf8')
      )
      expect(result).toMatchObject({
        passed: true,
        variant,
        cases:
          variant === 'reset-consumer-cycle' ||
          variant === 'reset-multiple-consumers'
            ? 3
            : variant === 'reset' ||
                variant === 'reset-async-arrow' ||
                variant === 'reset-async-function'
              ? 2
              : 1,
        wholeAuthoredRowExact: true,
        wholeRequireEventsExact: true,
        semanticCaseFieldsExact: true,
        authoredSourceBytesExact: true,
      })
      const closed = JSON.parse(
        await readFile(join(output, 'CLOSED.json'), 'utf8')
      )
      expect(closed).toEqual({
        allActualProcessesJoined: true,
        fixtureRetired: true,
      })
      complete = true
    } catch (cause) {
      throw new Error(
        `CommonJS composition evidence retained at ${temporary}`,
        { cause }
      )
    } finally {
      if (complete) await rm(temporary, { recursive: true, force: true })
    }
  },
  180000
)

it('preserves a retained reset reference alongside original CommonJS require in development', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'next-cjs-retained-reset-'))
  let complete = false
  try {
    const output = join(temporary, 'evidence')
    await promisify(execFile)(
      process.execPath,
      [
        join(__dirname, 'verify.mjs'),
        join(__dirname, '../../..'),
        output,
        'retained-reset-require',
        '--source',
      ],
      { timeout: 150000, maxBuffer: 1024 * 1024 }
    )
    const result = JSON.parse(
      await readFile(join(output, 'RESULT.json'), 'utf8')
    )
    expect(result).toEqual({
      passed: true,
      variant: 'retained-reset-require',
      engine: process.versions.node.split('.')[0],
      actualNodeVersion: process.version,
      mode: 'development',
      cases: 2,
      wholeAuthoredRowExact: true,
      wholeRequireEventsExact: true,
      semanticCaseFieldsExact: true,
      authoredSourceBytesExact: true,
      completeStandardReportExact: true,
      completeReporterCallbacksExact: true,
    })
    expect(
      JSON.parse(await readFile(join(output, 'CLOSED.json'), 'utf8'))
    ).toEqual({
      allActualProcessesJoined: true,
      fixtureRetired: true,
    })
    complete = true
  } catch (cause) {
    throw new Error(
      `Retained reset composition evidence retained at ${temporary}`,
      { cause }
    )
  } finally {
    if (complete) await rm(temporary, { recursive: true, force: true })
  }
}, 180000)

it('preserves retained reset semantics with default and JSON reporters', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'next-cjs-standard-reset-'))
  let complete = false
  try {
    const output = join(temporary, 'evidence')
    await promisify(execFile)(
      process.execPath,
      [
        join(__dirname, 'verify-standard.mjs'),
        join(__dirname, '../../..'),
        output,
        'source',
      ],
      { timeout: 150000, maxBuffer: 1024 * 1024 }
    )
    expect(
      JSON.parse(await readFile(join(output, 'RESULT.json'), 'utf8'))
    ).toMatchObject({
      passed: true,
      variant: 'retained-reset-require-standard-reporters',
      kind: 'source',
      engine: process.versions.node.split('.')[0],
      actualNodeVersion: process.version,
      mode: 'development',
      reporters: ['default', 'json'],
      customReporterRegistered: false,
      cases: 2,
      rows: 2,
      events: 7,
      completeStandardReportExact: true,
      completeCaseMetadataExact: true,
      wholeAuthoredRowExact: true,
      wholeRequireEventsAndCountsExact: true,
      authoredSourceBytesExact: true,
      historicalC3SixFieldProjectionExact: true,
      actualConsumerNextNativeIdentityHeld: true,
      originalFullReporterGateClaimedGreen: false,
    })
    expect(
      JSON.parse(await readFile(join(output, 'CLOSED.json'), 'utf8'))
    ).toEqual({
      allActualProcessesJoined: true,
      fixtureRetired: true,
    })
    complete = true
  } catch (cause) {
    throw new Error(
      `Standard reporter reset evidence retained at ${temporary}`,
      { cause }
    )
  } finally {
    if (complete) await rm(temporary, { recursive: true, force: true })
  }
}, 180000)

it.each(['retained', 'direct'])(
  'preserves production reset semantics with default and JSON reporters: %s',
  async (form) => {
    const temporary = await mkdtemp(
      join(tmpdir(), 'next-cjs-production-reset-')
    )
    let complete = false
    try {
      const output = join(temporary, 'evidence')
      await promisify(execFile)(
        process.execPath,
        [
          join(__dirname, 'verify-production-standard.mjs'),
          join(__dirname, '../../..'),
          output,
          'source',
          form,
        ],
        { timeout: 150000, maxBuffer: 1024 * 1024 }
      )
      const result = JSON.parse(
        await readFile(join(output, 'RESULT.json'), 'utf8')
      )
      expect(result).toMatchObject({
        passed: true,
        kind: 'source',
        form,
        engine: process.versions.node.split('.')[0],
        actualNodeVersion: process.version,
        mode: 'production',
        reporters: ['default', 'json'],
        customReporterRegistered: false,
        cases: 2,
        rows: 2,
        events: 7,
        completeStandardReportExact: true,
        completeCaseMetadataExact: true,
        wholeAuthoredRowExact: true,
        wholeRequireEventsAndCountsExact: true,
        authoredSourceBytesExact: true,
        historicalC4SixFieldProjectionExact: true,
        actualConsumerNextNativeIdentityHeld: true,
        originalFullReporterGateClaimedGreen: false,
        defaultRenderedTextParityClaimed: false,
        allActualOwnersJoined: true,
      })
      expect(
        JSON.parse(await readFile(join(output, 'CLOSED.json'), 'utf8'))
      ).toEqual({
        allActualProcessesJoined: true,
        fixtureRetired: true,
      })
      complete = true
    } catch (cause) {
      throw new Error(
        `Production reset standard reporter evidence retained at ${temporary}`,
        { cause }
      )
    } finally {
      if (complete) await rm(temporary, { recursive: true, force: true })
    }
  },
  180000
)

it.each([
  { variant: 'retained-reset-async-arrow', cases: 2, events: 7 },
  { variant: 'retained-reset-async-function', cases: 2, events: 7 },
  { variant: 'retained-reset-consumer-cycle', cases: 3, events: 23 },
  { variant: 'retained-reset-multiple-consumers', cases: 3, events: 35 },
])(
  'preserves retained reset combinations with default and JSON reporters: $variant',
  async ({ variant, cases, events }) => {
    const temporary = await mkdtemp(
      join(tmpdir(), 'next-cjs-retained-combinations-')
    )
    let complete = false
    try {
      const output = join(temporary, 'evidence')
      await promisify(execFile)(
        process.execPath,
        [
          join(__dirname, 'verify-combinations-standard.mjs'),
          join(__dirname, '../../..'),
          output,
          'source',
          variant,
        ],
        { timeout: 150000, maxBuffer: 1024 * 1024 }
      )
      const result = JSON.parse(
        await readFile(join(output, 'RESULT.json'), 'utf8')
      )
      expect(result).toMatchObject({
        passed: true,
        variant,
        kind: 'source',
        engine: process.versions.node.split('.')[0],
        actualNodeVersion: process.version,
        mode: 'development',
        reporters: ['default', 'json'],
        customReporterRegistered: false,
        cases,
        rows: cases,
        events,
        completeStandardReportExact: true,
        completeCaseMetadataExact: true,
        wholeAuthoredRowExact: true,
        wholeRequireEventsAndCountsExact: true,
        authoredSourceBytesExact: true,
        historicalC3CombinationSixFieldProjectionExact: true,
        actualConsumerNextNativeIdentityHeld: true,
        originalFullReporterGateClaimedGreen: false,
        originalCombinationFullSevenFieldAll192CallbackGateClaimedGreen: false,
        defaultRenderedTextParityClaimed: false,
        allActualOwnersJoined: true,
      })
      expect(
        JSON.parse(await readFile(join(output, 'CLOSED.json'), 'utf8'))
      ).toEqual({
        allActualProcessesJoined: true,
        fixtureRetired: true,
      })
      complete = true
    } catch (cause) {
      throw new Error(
        `Retained combination standard reporter evidence retained at ${temporary}`,
        { cause }
      )
    } finally {
      if (complete) await rm(temporary, { recursive: true, force: true })
    }
  },
  180000
)
