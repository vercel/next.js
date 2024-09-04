/* eslint-env jest */

import { remove } from 'fs-extra'
import { nextBuild } from 'next-test-utils'
import path, { join } from 'path'
import fs from 'fs'

const fixturesDir = join(__dirname, '..', 'fixtures')

describe('Application Export Intent Output', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      describe('Default Export', () => {
        const appDir = join(fixturesDir, 'default-export')
        const distDir = join(appDir, '.next')
        const outDir = join(appDir, 'out')

        beforeAll(async () => {
          await remove(distDir)
          await remove(outDir)
        })

        it('should build and export', async () => {
          await nextBuild(appDir)
        })

        it('should have the expected outputs for export', () => {
          expect(
            JSON.parse(
              fs.readFileSync(join(distDir, 'export-marker.json'), 'utf8')
            )
          ).toMatchInlineSnapshot(`
        {
          "exportTrailingSlash": false,
          "hasExportPathMap": false,
          "isNextImageImported": false,
          "version": 1,
        }
      `)

          const detail = JSON.parse(
            fs.readFileSync(join(distDir, 'export-detail.json'), 'utf8')
          )
          expect({
            ...detail,
            outDirectory: path.basename(detail.outDirectory),
          }).toMatchInlineSnapshot(`
        {
          "outDirectory": "out",
          "success": true,
          "version": 1,
        }
      `)
        })
      })
    }
  )

  describe('Custom Export', () => {
    ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
      'production mode',
      () => {
        const appDir = join(fixturesDir, 'custom-export')
        const distDir = join(appDir, '.next')
        const outDir = join(appDir, 'out')

        beforeAll(async () => {
          await remove(distDir)
          await remove(outDir)
        })

        it('should build and export', async () => {
          await nextBuild(appDir)
        })

        it('should have the expected outputs for export', () => {
          expect(
            JSON.parse(
              fs.readFileSync(join(distDir, 'export-marker.json'), 'utf8')
            )
          ).toMatchInlineSnapshot(`
        {
          "exportTrailingSlash": false,
          "hasExportPathMap": true,
          "isNextImageImported": false,
          "version": 1,
        }
      `)

          const detail = JSON.parse(
            fs.readFileSync(join(distDir, 'export-detail.json'), 'utf8')
          )
          expect({
            ...detail,
            outDirectory: path.basename(detail.outDirectory),
          }).toMatchInlineSnapshot(`
        {
          "outDirectory": "out",
          "success": true,
          "version": 1,
        }
      `)
        })
      }
    )
  })

  describe('Custom Out', () => {
    ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
      'production mode',
      () => {
        const appDir = join(fixturesDir, 'custom-out')
        const distDir = join(appDir, '.next')
        const outDir = join(appDir, 'lel')

        beforeAll(async () => {
          await remove(distDir)
          await remove(outDir)
        })

        it('should build and export', async () => {
          await nextBuild(appDir)
        })

        it('should have the expected outputs for export', () => {
          expect(
            JSON.parse(
              fs.readFileSync(join(distDir, 'export-marker.json'), 'utf8')
            )
          ).toMatchInlineSnapshot(`
        {
          "exportTrailingSlash": true,
          "hasExportPathMap": false,
          "isNextImageImported": false,
          "version": 1,
        }
      `)

          const detail = JSON.parse(
            fs.readFileSync(join(distDir, 'export-detail.json'), 'utf8')
          )
          expect({
            ...detail,
            outDirectory: path.basename(detail.outDirectory),
          }).toMatchInlineSnapshot(`
        {
          "outDirectory": "lel",
          "success": true,
          "version": 1,
        }
      `)
        })
      }
    )
  })

  describe('Bad Export', () => {
    ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
      'production mode',
      () => {
        const appDir = join(fixturesDir, 'bad-export')
        const distDir = join(appDir, '.next')
        const outDir = join(appDir, 'out')

        beforeAll(async () => {
          await remove(distDir)
          await remove(outDir)
        })

        it('should build and export', async () => {
          const result = await nextBuild(appDir, [], { stderr: true })
          expect(result.stderr).toMatch('.getInitialProps()')
          expect(result.code).toBe(1)
        })

        it('should have the expected outputs for export', () => {
          expect(
            JSON.parse(
              fs.readFileSync(join(distDir, 'export-marker.json'), 'utf8')
            )
          ).toMatchInlineSnapshot(`
        {
          "exportTrailingSlash": false,
          "hasExportPathMap": false,
          "isNextImageImported": false,
          "version": 1,
        }
      `)

          const detail = JSON.parse(
            fs.readFileSync(join(distDir, 'export-detail.json'), 'utf8')
          )
          expect({
            ...detail,
            outDirectory: path.basename(detail.outDirectory),
          }).toMatchInlineSnapshot(`
        {
          "outDirectory": "out",
          "success": false,
          "version": 1,
        }
      `)
        })
      }
    )
  })

  describe('No Export', () => {
    ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
      'production mode',
      () => {
        const appDir = join(fixturesDir, 'no-export')
        const distDir = join(appDir, '.next')

        beforeAll(async () => {
          await remove(distDir)
        })

        it('should build and not export', async () => {
          await nextBuild(appDir)
        })

        it('should have the expected outputs for export', () => {
          expect(
            JSON.parse(
              fs.readFileSync(join(distDir, 'export-marker.json'), 'utf8')
            )
          ).toMatchInlineSnapshot(`
        {
          "exportTrailingSlash": false,
          "hasExportPathMap": false,
          "isNextImageImported": false,
          "version": 1,
        }
      `)

          expect(() => {
            fs.readFileSync(join(distDir, 'export-detail.json'), 'utf8')
          }).toThrow(/ENOENT/)
        })

        it('should build and clean up', async () => {
          await nextBuild(appDir)

          expect(() => {
            fs.readFileSync(join(distDir, 'export-detail.json'), 'utf8')
          }).toThrow(/ENOENT/)
        })
      }
    )
  })
})
