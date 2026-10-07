/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import { nextBuild } from 'next-test-utils'

const appDir = join(__dirname, '../app')

describe('build trace - top-level entry includes', () => {
  ;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
    'production mode (webpack)',
    () => {
      const hasNativeBinary = (trace: { files: string[] }) =>
        trace.files.some((file) =>
          file.replace(/\\/g, '/').endsWith('include-me/native-binary.node')
        )

      let buildExitCode: number

      beforeAll(async () => {
        const result = await nextBuild(appDir, undefined, {
          cwd: appDir,
          stderr: true,
          stdout: true,
        })
        buildExitCode = result.code ?? -1
      })

      it('should apply outputFileTracingIncludes to the instrumentation entry', async () => {
        expect(buildExitCode).toBe(0)

        const trace = await fs.readJSON(
          join(appDir, '.next/server/instrumentation.js.nft.json')
        )

        expect(hasNativeBinary(trace)).toBe(true)
      })

      it('should apply outputFileTracingIncludes to the Node-runtime middleware entry', async () => {
        expect(buildExitCode).toBe(0)

        const trace = await fs.readJSON(
          join(appDir, '.next/server/middleware.js.nft.json')
        )

        expect(hasNativeBinary(trace)).toBe(true)
      })
    }
  )
})
