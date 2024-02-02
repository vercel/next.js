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
          TURBOREPO_TRACE_FILE: '.turbo/turborepo-trace.json',
          SSG_ROUTE_ENV_VAR_HEADER_TEXT: 'Welcome',
        },
      })
      expect(result.code).toBe(0)

      const accessTrace = await fs.readJSON(
        join(appDir, '.turbo', 'turborepo-trace.json')
      )
      expect(accessTrace.outputs).toStrictEqual(['dist/**', '!dist/cache/**'])
      expect(accessTrace.accessed.envVarKeys).toBeArray()
      expect(accessTrace.accessed.envVarKeys).toContain(
        'SSG_ROUTE_ENV_VAR_HEADER_TEXT'
      )
      expect(accessTrace.accessed.network).toBeFalse()
      expect(accessTrace.accessed.filePaths).toBeArray()
    })
  })
})
