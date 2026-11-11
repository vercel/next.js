import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

it('resizes a real main-frame Chromium layout and preserves native Promise zero viewport geometry and lazy polling behavior', async () => {
  const retained = process.env.NEXT_TESTING_RUNTIME_VIEWPORT_EVIDENCE
  const temporary =
    retained ?? (await mkdtemp(join(tmpdir(), 'next-runtime-viewport-')))
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
    expect(verified.cases).toBe(12)
    expect(verified.viewportBehaviorAssertionsPassed).toBe(true)
    expect(verified.pollBehaviorAssertionsPassed).toBe(true)
    expect(verified.allOwnersJoined).toBe(true)
    complete = true
  } catch (error) {
    throw new Error(`Runtime viewport evidence retained at ${temporary}`, {
      cause: error,
    })
  } finally {
    if (complete && !retained)
      await rm(temporary, { recursive: true, force: true })
  }
}, 540000)
