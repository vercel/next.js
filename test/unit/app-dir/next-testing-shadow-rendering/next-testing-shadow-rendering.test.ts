import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

it('preserves real hydration, portal context and native shadow-root locator identity', async () => {
  const retained = process.env.NEXT_TESTING_SHADOW_RENDERING_EVIDENCE
  const temporary =
    retained ?? (await mkdtemp(join(tmpdir(), 'next-shadow-rendering-')))
  let complete = false
  try {
    const evidence = retained ?? join(temporary, 'evidence')
    await promisify(execFile)(
      process.execPath,
      [join(__dirname, 'verify.mjs'), join(__dirname, '../../../..'), evidence],
      { timeout: 270000, maxBuffer: 1024 * 1024 }
    )
    const result = JSON.parse(
      await readFile(join(evidence, 'VERIFIED.json'), 'utf8')
    )
    expect(result.profiles).toBe(2)
    expect(result.cases).toBe(8)
    expect(result.completeGenuineRenderingAndLocatorModelsExact).toBe(true)
    expect(result.allOwnersJoined).toBe(true)
    complete = true
  } catch (error) {
    throw new Error(`Shadow rendering evidence retained at ${temporary}`, {
      cause: error,
    })
  } finally {
    if (complete && !retained)
      await rm(temporary, { recursive: true, force: true })
  }
}, 300000)
