import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const consumer = join(__dirname, '../../../..')

it.each([
  ['setup', 'gated'],
  ['teardown', 'gated'],
  ['setup', 'root-gated'],
  ['teardown', 'root-gated'],
])(
  'preserves disjoint AroundAll recovery, real settlement and exact %s errors for %s',
  async (phase, variant) => {
    const temporary = await mkdtemp(join(tmpdir(), 'next-around-all-recovery-'))
    let complete = false
    try {
      const evidence = join(temporary, 'evidence')
      await promisify(execFile)(
        process.execPath,
        [
          join(__dirname, 'verify-node.mjs'),
          consumer,
          evidence,
          phase,
          variant,
        ],
        { timeout: 260000, maxBuffer: 4 * 1024 * 1024 }
      )
      const verified = JSON.parse(
        await readFile(join(evidence, 'VERIFIED.json'), 'utf8')
      )
      expect(verified.allPassed).toBe(true)
      expect(verified.profiles).toHaveLength(2)
      expect(verified.actualCases).toBe(4)
      expect(verified.allRuntimeOwnersJoined).toBe(true)
      expect(verified.originalAuthoredSourcesAndBoundsHeld).toBe(true)
      complete = true
    } catch (cause) {
      throw new Error(`AroundAll recovery evidence retained at ${temporary}`, {
        cause,
      })
    } finally {
      if (complete) await rm(temporary, { recursive: true, force: true })
    }
  },
  270000
)
