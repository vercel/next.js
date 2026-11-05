import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

it.each([
  ['base', 1],
  ['lazy', 1],
  ['missing-fields', 1],
  ['production-base', 1],
  ['production-lazy', 1],
  ['reset', 2],
  ['reset-async-arrow', 2],
  ['reset-async-function', 2],
  ['reset-consumer-cycle', 3],
  ['reset-multiple-consumers', 3],
  ['retained-reset-require', 2],
  ['production-retained', 2],
  ['production-direct', 2],
  ['retained-reset-async-arrow', 2],
  ['retained-reset-async-function', 2],
  ['retained-reset-consumer-cycle', 3],
  ['retained-reset-multiple-consumers', 3],
])(
  'preserves original CommonJS require alongside an ESM mock: %s',
  async (variant, cases) => {
    const temporary = await mkdtemp(join(tmpdir(), 'next-cjs-composition-'))
    let complete = false
    try {
      const { stdout } = await promisify(execFile)(
        process.execPath,
        [
          join(__dirname, 'verify.mjs'),
          join(__dirname, '../../..'),
          join(temporary, 'result'),
          String(variant),
        ],
        { timeout: 150000, maxBuffer: 1024 * 1024 }
      )
      expect(JSON.parse(stdout)).toEqual({
        passed: true,
        mode: String(variant).startsWith('production-')
          ? 'production'
          : 'development',
        cases,
      })
      complete = true
    } finally {
      if (complete) await rm(temporary, { recursive: true, force: true })
    }
  },
  180000
)
