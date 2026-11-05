import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

it('resizes the actual owned WebKit main Page with responsive layout and Promise behavior', async () => {
  const retained = process.env.NEXT_TESTING_WEBKIT_RUNTIME_VIEWPORT_EVIDENCE
  const temporary =
    retained ?? (await mkdtemp(join(tmpdir(), 'next-webkit-runtime-viewport-')))
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
    expect(verified.profiles).toBe(2)
    expect(verified.cases).toBe(2)
    expect(verified.viewportBehaviorAssertionsPassed).toBe(true)
    expect(verified.allOwnersJoined).toBe(true)
    complete = true
  } catch (error) {
    throw new Error(
      `WebKit runtime viewport evidence retained at ${temporary}`,
      {
        cause: error,
      }
    )
  } finally {
    if (complete && !retained)
      await rm(temporary, { recursive: true, force: true })
  }
}, 540000)

it('retains one actual WebKit main Page owner and rejects closed Page or Context', async () => {
  const retained = process.env.NEXT_TESTING_WEBKIT_VIEWPORT_OWNER_EVIDENCE
  const temporary =
    retained ?? (await mkdtemp(join(tmpdir(), 'next-webkit-viewport-owner-')))
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
    expect(result.cases).toBe(3)
    expect(result.actualNativeOwnerRefusals).toBe(true)
    expect(result.allOwnersJoined).toBe(true)
    complete = true
  } catch (error) {
    throw new Error(`WebKit viewport owner evidence retained at ${temporary}`, {
      cause: error,
    })
  } finally {
    if (complete && !retained)
      await rm(temporary, { recursive: true, force: true })
  }
}, 150000)
