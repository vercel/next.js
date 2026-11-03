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
