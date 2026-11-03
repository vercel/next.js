import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

it('matches genuine automatic tick modes, microtasks and cross-case clock persistence in both Browser engines and modes', async () => {
  const temporary = await mkdtemp(
    join(tmpdir(), 'next-browser-clock-tick-modes-')
  )
  let complete = false
  try {
    const evidence = join(temporary, 'evidence')
    await promisify(execFile)(
      process.execPath,
      [join(__dirname, 'verify.mjs'), join(__dirname, '../../..'), evidence],
      { timeout: 510000, maxBuffer: 1024 * 1024 }
    )
    const verified = JSON.parse(
      await readFile(join(evidence, 'VERIFIED.json'), 'utf8')
    )
    expect(verified.allPassed).toBe(true)
    expect(verified.profiles).toHaveLength(4)
    expect(verified.actualCases).toBe(20)
    expect(verified.wholeAuthorRows).toBe(24)
    expect(
      verified.profiles.every(
        (profile: {
          completeReferenceFieldsEqual: boolean
          completeRowsCasesSummaryEqual: boolean
          nextEnvelopeRetained: boolean
          actualOwnersJoined: boolean
        }) =>
          profile.completeReferenceFieldsEqual &&
          profile.completeRowsCasesSummaryEqual &&
          profile.nextEnvelopeRetained &&
          profile.actualOwnersJoined
      )
    ).toBe(true)
    expect(verified.allPhysicalOwnersJoined).toBe(true)
    expect(verified.noProductChange).toBe(true)
    complete = true
  } catch (cause) {
    throw new Error(`Browser tick-mode evidence retained at ${temporary}`, {
      cause,
    })
  } finally {
    if (complete) await rm(temporary, { recursive: true, force: true })
  }
}, 540000)
