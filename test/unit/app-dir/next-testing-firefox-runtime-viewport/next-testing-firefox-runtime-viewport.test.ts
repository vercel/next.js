import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

it('resizes the actual owned Firefox frame and preserves genuine responsive and zero viewport models', async () => {
  const retained = process.env.NEXT_TESTING_FIREFOX_RUNTIME_VIEWPORT_EVIDENCE
  const temporary =
    retained ??
    (await mkdtemp(join(tmpdir(), 'next-firefox-runtime-viewport-')))
  let complete = false
  try {
    const evidence = retained ?? join(temporary, 'evidence')
    await promisify(execFile)(
      process.execPath,
      [join(__dirname, 'verify.mjs'), join(__dirname, '../../../..'), evidence],
      { timeout: 510000, maxBuffer: 1024 * 1024 }
    )
    const verified = JSON.parse(
      await readFile(join(evidence, 'VERIFIED.json'), 'utf8')
    )
    expect(verified.profiles).toBe(4)
    expect(verified.cases).toBe(4)
    expect(verified.completeGenuineFirefoxViewportModelsExact).toBe(true)
    expect(verified.allOwnersJoined).toBe(true)
    complete = true
  } catch (error) {
    throw new Error(
      `Firefox runtime viewport evidence retained at ${temporary}`,
      {
        cause: error,
      }
    )
  } finally {
    if (complete && !retained)
      await rm(temporary, { recursive: true, force: true })
  }
}, 540000)

it('rejects actual detached, replaced and stale Firefox frame ownership', async () => {
  const retained = process.env.NEXT_TESTING_FIREFOX_VIEWPORT_OWNER_EVIDENCE
  const temporary =
    retained ?? (await mkdtemp(join(tmpdir(), 'next-firefox-viewport-owner-')))
  let complete = false
  try {
    const evidence = retained ?? join(temporary, 'evidence')
    await promisify(execFile)(
      process.execPath,
      [
        join(__dirname, 'verify-owner.mjs'),
        join(__dirname, '../../../..'),
        evidence,
      ],
      { timeout: 130000, maxBuffer: 1024 * 1024 }
    )
    const result = JSON.parse(
      await readFile(join(evidence, 'VERIFIED.json'), 'utf8')
    )
    expect(result.cases).toBe(4)
    expect(result.actualNativeOwnerRefusals).toBe(true)
    expect(result.allOwnersJoined).toBe(true)
    complete = true
  } catch (error) {
    throw new Error(
      `Firefox viewport owner evidence retained at ${temporary}`,
      { cause: error }
    )
  } finally {
    if (complete && !retained)
      await rm(temporary, { recursive: true, force: true })
  }
}, 150000)
