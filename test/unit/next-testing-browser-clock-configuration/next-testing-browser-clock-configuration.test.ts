import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

it('preserves Browser clock configuration, automatic ticks and cross-case timers in both engines and modes', async () => {
  const temporary = await mkdtemp(
    join(tmpdir(), 'next-browser-clock-configuration-')
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
    expect(verified.profiles).toHaveLength(4)
    expect(verified.cases).toBe(48)
    expect(verified.clockBehaviorAssertionsPassed).toBe(true)
    expect(verified.actualDOMRealmAsserted).toBe(true)
    expect(verified.allOwnersJoined).toBe(true)
    expect(verified.allInputsRemovedAfterOwnedReadersJoined).toBe(true)
    complete = true
  } catch (error) {
    throw new Error(`Browser clock evidence retained at ${temporary}`, {
      cause: error,
    })
  } finally {
    if (complete) await rm(temporary, { recursive: true, force: true })
  }
}, 540000)
