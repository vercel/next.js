import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

it('retries primitive metadata and retains failed attempts in both modes', async () => {
  const retained = process.env.NEXT_TESTING_RETRY_METADATA_EVIDENCE
  const temporary =
    retained ?? (await mkdtemp(join(tmpdir(), 'next-retry-metadata-')))
  let complete = false
  try {
    const evidence = retained ?? join(temporary, 'evidence')
    await promisify(execFile)(
      process.execPath,
      [join(__dirname, 'verify.mjs'), join(__dirname, '../../..'), evidence],
      { timeout: 390000, maxBuffer: 1024 * 1024 }
    )
    const verified = JSON.parse(
      await readFile(join(evidence, 'VERIFIED.json'), 'utf8')
    )
    expect(verified.profiles).toBe(2)
    expect(verified.cases).toBe(16)
    expect(verified.behavioralChecks).toBe(true)
    expect(verified.allOwnersJoined).toBe(true)
    complete = true
  } catch (error) {
    throw new Error(`Retry metadata evidence retained at ${temporary}`, {
      cause: error,
    })
  } finally {
    if (complete && !retained)
      await rm(temporary, { recursive: true, force: true })
  }
}, 420000)
