/* eslint-env jest */

import { existsSync } from 'fs'
import { join } from 'path'
import { nextBuild } from 'next-test-utils'

const appDir = join(__dirname, '../app')

describe('instrumentation hook detection with custom multi-segment pageExtensions', () => {
  ;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
    'production mode (webpack)',
    () => {
      it('compiles src/instrumentation.universal.ts when it matches pageExtensions', async () => {
        const result = await nextBuild(appDir, undefined, {
          cwd: appDir,
          stderr: true,
          stdout: true,
        })
        expect(result.code).toBe(0)

        // If the hook was detected, the build emits the compiled
        // instrumentation entry to `.next/server/instrumentation.js`.
        // Before the fix for #92342, custom multi-segment pageExtensions
        // (e.g. `universal.ts`) caused the file to be matched by the
        // detection regex but then dropped because
        // `path.parse('instrumentation.universal.ts').name` is
        // `'instrumentation.universal'` — not `'instrumentation'` — so
        // the equality check against `INSTRUMENTATION_HOOK_FILENAME`
        // failed and `instrumentation.js` was never produced.
        expect(
          existsSync(join(appDir, '.next/server/instrumentation.js'))
        ).toBe(true)
      })
    }
  )
})
