/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import { nextBuild } from 'next-test-utils'

const appDir = join(__dirname, '../app')

;(process.env.TURBOPACK ? describe.skip : describe)(
  'build trace with extra entries',
  () => {
    ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
      'production mode',
      () => {
        it('should build and trace correctly', async () => {
          const result = await nextBuild(appDir, undefined, {
            cwd: appDir,
            stderr: true,
            stdout: true,
          })
          console.log(result)
          expect(result.code).toBe(0)

          const appTrace = await fs.readJSON(
            join(appDir, '.next/server/pages/_app.js.nft.json')
          )
          const indexTrace = await fs.readJSON(
            join(appDir, '.next/server/pages/index.js.nft.json')
          )
          const anotherTrace = await fs.readJSON(
            join(appDir, '.next/server/pages/another.js.nft.json')
          )
          const imageTrace = await fs.readJSON(
            join(appDir, '.next/server/pages/image-import.js.nft.json')
          )

          const tracedFiles = [
            ...appTrace.files,
            ...indexTrace.files,
            ...anotherTrace.files,
            ...imageTrace.files,
          ]

          expect(tracedFiles.some((file) => file.endsWith('hello.json'))).toBe(
            true
          )
          expect(
            tracedFiles.some((file) => file.includes('some-cms/index.js'))
          ).toBe(true)
          expect(
            tracedFiles.some((file) => file === '../../../include-me/hello.txt')
          ).toBe(true)
          expect(
            tracedFiles.some(
              (file) => file === '../../../include-me/second.txt'
            )
          ).toBe(true)
          expect(
            indexTrace.files.some((file) => file.includes('exclude-me'))
          ).toBe(false)

          expect(
            tracedFiles.some((file) =>
              file.includes('nested-structure/constants/package.json')
            )
          ).toBe(true)
          expect(
            tracedFiles.some((file) =>
              file.includes('nested-structure/package.json')
            )
          ).toBe(true)
          expect(
            tracedFiles.some((file) =>
              file.includes('nested-structure/lib/constants.js')
            )
          ).toBe(true)
          expect(
            tracedFiles.some((file) => file.includes('public/another.jpg'))
          ).toBe(true)
          expect(
            tracedFiles.some((file) => file.includes('public/test.jpg'))
          ).toBe(false)
        })
      }
    )
  }
)
