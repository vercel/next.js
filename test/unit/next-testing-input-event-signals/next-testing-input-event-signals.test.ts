import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

it('preserves real fill input fields, native signal state, listener removal and accepted foreign receivers', async () => {
  const retained = process.env.NEXT_TESTING_INPUT_SIGNALS_EVIDENCE
  const temporary =
    retained ?? (await mkdtemp(join(tmpdir(), 'next-input-signals-')))
  let complete = false
  try {
    const evidence = retained ?? join(temporary, 'evidence')
    await promisify(execFile)(
      process.execPath,
      [join(__dirname, 'verify.mjs'), join(__dirname, '../../..'), evidence],
      { timeout: 510000, maxBuffer: 1024 * 1024 }
    )
    const verified = JSON.parse(
      await readFile(join(evidence, 'VERIFIED.json'), 'utf8')
    )
    expect(verified.profiles).toBe(4)
    expect(verified.cases).toBe(16)
    expect(verified.completeGenuineInputAndSignalModelsExact).toBe(true)
    expect(verified.acceptedForeignSignalAndNativeBrandErrorsQualified).toBe(
      true
    )
    expect(verified.allOwnersJoined).toBe(true)
    complete = true
  } catch (error) {
    throw new Error(`Input event/signal evidence retained at ${temporary}`, {
      cause: error,
    })
  } finally {
    if (complete && !retained)
      await rm(temporary, { recursive: true, force: true })
  }
}, 540000)

it.each(['node', 'jsdom'] as const)(
  'preserves actual %s EventTarget/signal brands and native listener ownership',
  async (realm) => {
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [join(__dirname, 'listener-realms.cjs'), realm],
      { timeout: 10000, maxBuffer: 1024 * 1024 }
    )
    expect(JSON.parse(stdout)).toEqual({
      realm,
      allNativeListenerControlsPassed: true,
      originalRealmAndErrorBrandsRetained: true,
    })
  }
)
