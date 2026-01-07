/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import { nextBuild } from 'next-test-utils'

const appDir = join(__dirname, '../app')

describe('build trace with extra entries in monorepo', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      it('should build and trace correctly', async () => {
        const result = await nextBuild(appDir, undefined, {
          cwd: appDir,
          stderr: true,
          stdout: true,
        })
        expect(result.code).toBe(0)
        console.log(result.stderr)
        console.log(result.stdout)

        const appDirRoute1Trace = await fs.readJSON(
          join(appDir, '.next/server/app/route1/route.js.nft.json')
        )

        expect(appDirRoute1Trace.files).toContain(
          '../../../../../other/included.txt'
        )
      })
    }
  )
})
