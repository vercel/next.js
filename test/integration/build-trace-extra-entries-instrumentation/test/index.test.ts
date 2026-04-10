/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import { nextBuild } from 'next-test-utils'

const appDir = join(__dirname, '../app')

describe('build trace - instrumentation entry includes', () => {
  ;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
    'production mode (webpack)',
    () => {
      it('should apply outputFileTracingIncludes to the instrumentation entry', async () => {
        const result = await nextBuild(appDir, undefined, {
          cwd: appDir,
          stderr: true,
          stdout: true,
        })
        expect(result.code).toBe(0)

        const trace = await fs.readJSON(
          join(appDir, '.next/server/instrumentation.js.nft.json')
        )

        const hasNativeBinary = trace.files.some((file: string) =>
          file.replace(/\\/g, '/').endsWith('include-me/native-binary.node')
        )

        expect(hasNativeBinary).toBe(true)
      })
    }
  )
})
