import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

it.each([
  'base',
  'lazy',
  'missing-fields',
  'production-base',
  'production-lazy',
  'reset',
  'reset-async-arrow',
  'reset-async-function',
  'reset-consumer-cycle',
  'reset-multiple-consumers',
])(
  'preserves original CommonJS require alongside an ESM factory: %s',
  async (variant) => {
    const temporary = await mkdtemp(join(tmpdir(), 'next-cjs-composition-'))
    let complete = false
    try {
      const output = join(temporary, 'evidence')
      await promisify(execFile)(
        process.execPath,
        [
          join(__dirname, 'verify.mjs'),
          join(__dirname, '../../..'),
          output,
          variant,
          '--source',
        ],
        { timeout: 150000, maxBuffer: 1024 * 1024 }
      )
      const result = JSON.parse(
        await readFile(join(output, 'RESULT.json'), 'utf8')
      )
      expect(result).toMatchObject({
        passed: true,
        variant,
        cases:
          variant === 'reset-consumer-cycle' ||
          variant === 'reset-multiple-consumers'
            ? 3
            : variant === 'reset' ||
                variant === 'reset-async-arrow' ||
                variant === 'reset-async-function'
              ? 2
              : 1,
        wholeAuthoredRowExact: true,
        wholeRequireEventsExact: true,
        semanticCaseFieldsExact: true,
        authoredSourceBytesExact: true,
      })
      const closed = JSON.parse(
        await readFile(join(output, 'CLOSED.json'), 'utf8')
      )
      expect(closed).toEqual({
        allActualProcessesJoined: true,
        fixtureRetired: true,
      })
      complete = true
    } catch (cause) {
      throw new Error(
        `CommonJS composition evidence retained at ${temporary}`,
        { cause }
      )
    } finally {
      if (complete) await rm(temporary, { recursive: true, force: true })
    }
  },
  180000
)
