import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

it('formats actual DOM/Locators with genuine defaults, sparse arrays and getter error effects', async () => {
  const retained = process.env.NEXT_TESTING_DOM_UTILITIES_EVIDENCE
  const temporary =
    retained ?? (await mkdtemp(join(tmpdir(), 'next-dom-utilities-')))
  let complete = false
  try {
    const evidence = retained ?? join(temporary, 'evidence')
    await promisify(execFile)(
      process.execPath,
      [join(__dirname, 'verify.mjs'), join(__dirname, '../../../..'), evidence],
      { timeout: 750000, maxBuffer: 1024 * 1024 }
    )
    const result = JSON.parse(
      await readFile(join(evidence, 'VERIFIED.json'), 'utf8')
    )
    expect(result.profiles).toBe(6)
    expect(result.cases).toBe(16)
    expect(result.completeGenuineDOMUtilityModelsExact).toBe(true)
    expect(result.allOwnersJoined).toBe(true)
    complete = true
  } catch (error) {
    throw new Error(`DOM utility evidence retained at ${temporary}`, {
      cause: error,
    })
  } finally {
    if (complete && !retained)
      await rm(temporary, { recursive: true, force: true })
  }
}, 780000)

it('publishes strict DOM utility signatures through both public Browser modules', async () => {
  const retained = process.env.NEXT_TESTING_DOM_UTILITIES_TYPES_EVIDENCE
  const temporary =
    retained ?? (await mkdtemp(join(tmpdir(), 'next-dom-utilities-types-')))
  let complete = false
  try {
    const evidence = retained ?? join(temporary, 'evidence')
    await promisify(execFile)(
      process.execPath,
      [
        join(__dirname, 'verify-types.mjs'),
        join(__dirname, '../../../..'),
        evidence,
      ],
      { timeout: 140000, maxBuffer: 1024 * 1024 }
    )
    const result = JSON.parse(
      await readFile(join(evidence, 'VERIFIED.json'), 'utf8')
    )
    expect(result.profiles).toBe(2)
    expect(result.actualShippedAmbientEntry).toBe(true)
    expect(result.allOwnersJoined).toBe(true)
    complete = true
  } catch (error) {
    throw new Error(`DOM utility type evidence retained at ${temporary}`, {
      cause: error,
    })
  } finally {
    if (complete && !retained)
      await rm(temporary, { recursive: true, force: true })
  }
}, 150000)

it('formats real missing-element Errors after selector and ARIA effects', async () => {
  const retained = process.env.NEXT_TESTING_DOM_ELEMENT_ERRORS_EVIDENCE
  const temporary =
    retained ?? (await mkdtemp(join(tmpdir(), 'next-dom-element-errors-')))
  let complete = false
  try {
    const evidence = retained ?? join(temporary, 'evidence')
    await promisify(execFile)(
      process.execPath,
      [
        join(__dirname, 'verify.mjs'),
        join(__dirname, '../../../..'),
        evidence,
        join(__dirname, '../../../..'),
        'element-errors',
      ],
      { timeout: 270000, maxBuffer: 1024 * 1024 }
    )
    const result = JSON.parse(
      await readFile(join(evidence, 'VERIFIED.json'), 'utf8')
    )
    expect(result.profiles).toBe(2)
    expect(result.cases).toBe(10)
    expect(result.completeGenuineDOMUtilityModelsExact).toBe(true)
    expect(result.allOwnersJoined).toBe(true)
    complete = true
  } catch (error) {
    throw new Error(`DOM element Error evidence retained at ${temporary}`, {
      cause: error,
    })
  } finally {
    if (complete && !retained)
      await rm(temporary, { recursive: true, force: true })
  }
}, 300000)

it('publishes strict missing-element Error signatures through both Browser modules', async () => {
  const retained = process.env.NEXT_TESTING_DOM_ELEMENT_ERRORS_TYPES_EVIDENCE
  const temporary =
    retained ??
    (await mkdtemp(join(tmpdir(), 'next-dom-element-errors-types-')))
  let complete = false
  try {
    const evidence = retained ?? join(temporary, 'evidence')
    await promisify(execFile)(
      process.execPath,
      [
        join(__dirname, 'verify-types.mjs'),
        join(__dirname, '../../../..'),
        evidence,
        join(__dirname, '../../../..'),
        'element-errors',
      ],
      { timeout: 140000, maxBuffer: 1024 * 1024 }
    )
    const result = JSON.parse(
      await readFile(join(evidence, 'VERIFIED.json'), 'utf8')
    )
    expect(result.profiles).toBe(2)
    expect(result.runs[0].negativeAssertionsConsumed).toBe(5)
    expect(result.runs[1].negativeAssertionsConsumed).toBe(5)
    expect(result.actualShippedAmbientEntry).toBe(true)
    expect(result.allOwnersJoined).toBe(true)
    complete = true
  } catch (error) {
    throw new Error(
      `DOM element Error type evidence retained at ${temporary}`,
      {
        cause: error,
      }
    )
  } finally {
    if (complete && !retained)
      await rm(temporary, { recursive: true, force: true })
  }
}, 150000)

it('uses actual configured locator error formats and retains canonical config effects', async () => {
  const retained = process.env.NEXT_TESTING_DOM_ERROR_FORMAT_STATE_EVIDENCE
  const temporary =
    retained ?? (await mkdtemp(join(tmpdir(), 'next-dom-error-format-state-')))
  let complete = false
  try {
    const evidence = retained ?? join(temporary, 'evidence')
    await promisify(execFile)(
      process.execPath,
      [
        join(__dirname, 'verify-error-format-state.mjs'),
        join(__dirname, '../../../..'),
        evidence,
      ],
      { timeout: 270000, maxBuffer: 1024 * 1024 }
    )
    const result = JSON.parse(
      await readFile(join(evidence, 'VERIFIED.json'), 'utf8')
    )
    expect(result.profiles).toBe(2)
    expect(result.cases).toBe(16)
    expect(result.rows).toBe(16)
    expect(result.completeModelsExact).toBe(true)
    expect(result.fullNativeStacksRetainedOutsideSemanticProjection).toBe(true)
    expect(result.allOwnersJoined).toBe(true)
    complete = true
  } catch (error) {
    throw new Error(`DOM errorFormat state evidence retained at ${temporary}`, {
      cause: error,
    })
  } finally {
    if (complete && !retained)
      await rm(temporary, { recursive: true, force: true })
  }
}, 300000)

it('publishes writable required errorFormat types through both Browser modules', async () => {
  const retained = process.env.NEXT_TESTING_DOM_ERROR_FORMAT_TYPES_EVIDENCE
  const temporary =
    retained ?? (await mkdtemp(join(tmpdir(), 'next-dom-error-format-types-')))
  let complete = false
  try {
    const evidence = retained ?? join(temporary, 'evidence')
    await promisify(execFile)(
      process.execPath,
      [
        join(__dirname, 'verify-error-format-types.mjs'),
        'source',
        join(__dirname, '../../../..'),
        evidence,
      ],
      { timeout: 140000, maxBuffer: 1024 * 1024 }
    )
    const result = JSON.parse(
      await readFile(join(evidence, 'VERIFIED.json'), 'utf8')
    )
    expect(result.qualification).toBe('source')
    expect(result.profiles).toBe(2)
    expect(result.requiredWritableThreeLiteralUnion).toBe(true)
    expect(result.negativeAssertionsConsumed).toBe(6)
    expect(result.unsuppressedNegativeDiagnosticsExact).toBe(true)
    expect(result.bothAliasesResolveSameActualNextServerSymbol).toBe(true)
    expect(result.actualShippedAmbientEntry).toBe(true)
    expect(result.installedZeroVitestQualified).toBe(false)
    expect(result.allOwnersJoined).toBe(true)
    complete = true
  } catch (error) {
    throw new Error(`DOM errorFormat type evidence retained at ${temporary}`, {
      cause: error,
    })
  } finally {
    if (complete && !retained)
      await rm(temporary, { recursive: true, force: true })
  }
}, 150000)
it('preserves native optional-container Errors and formatting effects', async () => {
  const retained = process.env.NEXT_TESTING_DOM_OPTIONAL_CONTAINERS_EVIDENCE
  const temporary =
    retained ?? (await mkdtemp(join(tmpdir(), 'next-dom-optional-containers-')))
  let complete = false
  try {
    const evidence = retained ?? join(temporary, 'evidence')
    await promisify(execFile)(
      process.execPath,
      [
        join(__dirname, 'verify-optional-container.mjs'),
        join(__dirname, '../../../..'),
        evidence,
      ],
      { timeout: 270000, maxBuffer: 1024 * 1024 }
    )
    const result = JSON.parse(
      await readFile(join(evidence, 'VERIFIED.json'), 'utf8')
    )
    expect(result.profiles).toBe(6)
    expect(result.cases).toBe(42)
    expect(result.rows).toBe(42)
    expect(result.rawNativeStacks).toBe(42)
    expect(result.completeModelsExact).toBe(true)
    expect(result.fullNativeStacksRetainedOutsideSemanticProjection).toBe(true)
    expect(result.allOwnersJoined).toBe(true)
    complete = true
  } catch (error) {
    throw new Error(
      `DOM optional-container evidence retained at ${temporary}`,
      {
        cause: error,
      }
    )
  } finally {
    if (complete && !retained)
      await rm(temporary, { recursive: true, force: true })
  }
}, 300000)
