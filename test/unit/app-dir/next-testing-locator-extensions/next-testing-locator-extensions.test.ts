import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

it('extends real page and locators with genuine descriptors, scoping, actions and callback effects', async () => {
  const retained = process.env.NEXT_TESTING_LOCATOR_EXTENSIONS_EVIDENCE
  const temporary =
    retained ?? (await mkdtemp(join(tmpdir(), 'next-locator-extensions-')))
  let complete = false
  try {
    const evidence = retained ?? join(temporary, 'evidence')
    await promisify(execFile)(
      process.execPath,
      [join(__dirname, 'verify.mjs'), join(__dirname, '../../../..'), evidence],
      { timeout: 510000, maxBuffer: 1024 * 1024 }
    )
    const result = JSON.parse(
      await readFile(join(evidence, 'VERIFIED.json'), 'utf8')
    )
    expect(result.profiles).toBe(4)
    expect(result.cases).toBe(12)
    expect(result.completeGenuinePositiveLocatorExtensionModelsExact).toBe(true)
    expect(result.actualRegistrationAndCallbackEffectsMatch).toBe(true)
    expect(result.allRawProjectionDifferencesReported).toBe(true)
    expect(result.allOwnersJoined).toBe(true)
    complete = true
  } catch (error) {
    throw new Error(`Locator extension evidence retained at ${temporary}`, {
      cause: error,
    })
  } finally {
    if (complete && !retained)
      await rm(temporary, { recursive: true, force: true })
  }
}, 540000)

it('publishes the Browser opt-in with strict locator augmentation in both public modules', async () => {
  const retained = process.env.NEXT_TESTING_LOCATOR_EXTENSIONS_TYPES_EVIDENCE
  const temporary =
    retained ??
    (await mkdtemp(join(tmpdir(), 'next-locator-extensions-types-')))
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
    throw new Error(
      `Locator extension type evidence retained at ${temporary}`,
      { cause: error }
    )
  } finally {
    if (complete && !retained)
      await rm(temporary, { recursive: true, force: true })
  }
}, 150000)

it('retains real locator registration and facade use across collection and test bodies', async () => {
  const retained = process.env.NEXT_TESTING_LOCATOR_EXTENSIONS_MODULE_EVIDENCE
  const temporary =
    retained ??
    (await mkdtemp(join(tmpdir(), 'next-locator-extension-module-')))
  let complete = false
  try {
    const evidence = retained ?? join(temporary, 'evidence')
    const consumer = join(__dirname, '../../../..')
    await promisify(execFile)(
      process.execPath,
      [join(__dirname, 'verify.mjs'), consumer, evidence, consumer, 'module'],
      { timeout: 270000, maxBuffer: 1024 * 1024 }
    )
    const result = JSON.parse(
      await readFile(join(evidence, 'VERIFIED.json'), 'utf8')
    )
    expect(result.profiles).toBe(2)
    expect(result.cases).toBe(4)
    expect(result.completeGenuineLocatorExtensionModelsExact).toBe(true)
    expect(result.allOwnersJoined).toBe(true)
    complete = true
  } catch (error) {
    throw new Error(`Module locator evidence retained at ${temporary}`, {
      cause: error,
    })
  } finally {
    if (complete && !retained)
      await rm(temporary, { recursive: true, force: true })
  }
}, 300000)
