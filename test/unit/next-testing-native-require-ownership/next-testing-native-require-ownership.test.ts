import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

it.each(['development', 'production'])(
  'preserves native CommonJS require identity with independent static/runtime mock registration in %s',
  async (mode) => {
    const temporary = await mkdtemp(join(tmpdir(), 'next-native-require-'))
    let complete = false
    try {
      const output = join(temporary, 'evidence')
      await promisify(execFile)(
        process.execPath,
        [
          join(__dirname, 'verify.mjs'),
          join(__dirname, '../../..'),
          output,
          mode,
          '--source',
        ],
        { timeout: 150000, maxBuffer: 1024 * 1024 }
      )
      const result = JSON.parse(
        await readFile(join(output, 'RESULT.json'), 'utf8')
      )
      expect(result.passed).toBe(true)
      expect(result.cases).toBe(3)
      expect(result.completeAuthoredRows).toBe(3)
      expect(result.completeStandardReportEqual).toBe(true)
      expect(result.originalSourceExact).toBe(true)
      const closed = JSON.parse(
        await readFile(join(output, 'CLOSED.json'), 'utf8')
      )
      expect(closed.strictOwnerJoined).toBe(true)
      expect(closed.fixtureRemoved).toBe(true)
      complete = true
    } catch (cause) {
      throw new Error(`Native require evidence retained at ${temporary}`, {
        cause,
      })
    } finally {
      if (complete) await rm(temporary, { recursive: true, force: true })
    }
  },
  180000
)
