/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import { nextBuild } from 'next-test-utils'

const appDir = join(__dirname, '../app')

describe('build with proxy trace', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    it('should build and output trace correctly', async () => {
      const result = await nextBuild(appDir, undefined, {
        cwd: appDir,
        stderr: true,
        stdout: true,
        env: {
          TURBOREPO_TRACE_FILE: 'dist/turborepo-trace.json',
          SSG_ROUTE_ENV_VAR_HEADER_TEXT: 'Welcome',
        },
      })
      expect(result.code).toBe(0)

      const accessTrace = await fs.readJSON(
        join(appDir, 'dist', 'turborepo-trace.json')
      )
      expect(accessTrace.outputs).toStrictEqual(['dist/**', '!dist/cache/**'])
      expect(accessTrace.access.readEnvVarKeys).toBeArray()
      expect(accessTrace.access.readEnvVarKeys).toContain(
        'SSG_ROUTE_ENV_VAR_HEADER_TEXT'
      )
      expect(accessTrace.access.accessedNetwork).toBeFalse()
      expect(accessTrace.access.accessedFilePaths).toBeArray()
    })
  })
})
