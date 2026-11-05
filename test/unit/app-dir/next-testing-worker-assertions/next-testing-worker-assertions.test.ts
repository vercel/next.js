import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const consumer = join(__dirname, '../../../..')

it('preserves actual worker assertion owners, cleanup errors and read-only snapshot timing', async () => {
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [join(__dirname, 'component.cjs'), consumer],
    { timeout: 30000, maxBuffer: 4 * 1024 * 1024 }
  )
  expect(JSON.parse(stdout)).toMatchObject({
    controls: 8,
    allPassed: true,
    componentOnlyNotPublicQualification: true,
  })
}, 35000)

it.each(['pass', 'setup-assert', 'setup-throw', 'cleanup-assert'])(
  'preserves worker assertion state and setup/cleanup failures for %s',
  async (profile) => {
    const temporary = await mkdtemp(join(tmpdir(), 'next-worker-assertions-'))
    let complete = false
    try {
      const evidence = join(temporary, 'evidence')
      await promisify(execFile)(
        process.execPath,
        [join(__dirname, 'verify-node.mjs'), consumer, evidence, profile],
        { timeout: 260000, maxBuffer: 4 * 1024 * 1024 }
      )
      const verified = JSON.parse(
        await readFile(join(evidence, 'VERIFIED.json'), 'utf8')
      )
      expect(verified.allPassed).toBe(true)
      expect(verified.profiles).toHaveLength(2)
      expect(verified.actualCases).toBe(4)
      expect(verified.allPhysicalOwnersJoined).toBe(true)
      expect(verified.behavioralChecks).toBe(true)
      complete = true
    } catch (cause) {
      throw new Error(`Worker assertion evidence retained at ${temporary}`, {
        cause,
      })
    } finally {
      if (complete) await rm(temporary, { recursive: true, force: true })
    }
  },
  270000
)
