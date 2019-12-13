/* eslint-env jest */
/* global jasmine */
import { remove } from 'fs-extra'
import { nextBuild, nextExport, nextExportDefault } from 'next-test-utils'
import path, { join } from 'path'
import fs from 'fs'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 2

const fixturesDir = join(__dirname, '..', 'fixtures')

describe('Application Export Intent Output', () => {
  describe('Default Export', () => {
    const appDir = join(fixturesDir, 'default-export')
    const distDir = join(appDir, '.next')

    beforeAll(async () => {
      await remove(distDir)
    })

    it('should build and export', async () => {
      await nextBuild(appDir)
      await nextExportDefault(appDir)
    })

    it('should have the expected outputs for export', () => {
      expect(
        JSON.parse(fs.readFileSync(join(distDir, 'export-marker.json'), 'utf8'))
      ).toMatchInlineSnapshot(`
        Object {
          "exportTrailingSlash": false,
          "hasExportPathMap": false,
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
        Object {
          "outDirectory": "out",
          "success": true,
          "version": 1,
        }
      `)
    })
  })

  describe('Custom Export', () => {
    const appDir = join(fixturesDir, 'custom-export')
    const distDir = join(appDir, '.next')

    beforeAll(async () => {
      await remove(distDir)
    })

    it('should build and export', async () => {
      await nextBuild(appDir)
      await nextExportDefault(appDir)
    })

    it('should have the expected outputs for export', () => {
      expect(
        JSON.parse(fs.readFileSync(join(distDir, 'export-marker.json'), 'utf8'))
      ).toMatchInlineSnapshot(`
        Object {
          "exportTrailingSlash": false,
          "hasExportPathMap": true,
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
        Object {
          "outDirectory": "out",
          "success": true,
          "version": 1,
        }
      `)
    })
  })

  describe('Custom Out', () => {
    const appDir = join(fixturesDir, 'custom-out')
    const distDir = join(appDir, '.next')

    beforeAll(async () => {
      await remove(distDir)
    })

    it('should build and export', async () => {
      await nextBuild(appDir)
      await nextExport(appDir, { outdir: join(appDir, 'lel') })
    })

    it('should have the expected outputs for export', () => {
      expect(
        JSON.parse(fs.readFileSync(join(distDir, 'export-marker.json'), 'utf8'))
      ).toMatchInlineSnapshot(`
        Object {
          "exportTrailingSlash": true,
          "hasExportPathMap": false,
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
        Object {
          "outDirectory": "lel",
          "success": true,
          "version": 1,
        }
      `)
    })
  })

  describe('Bad Export', () => {
    const appDir = join(fixturesDir, 'bad-export')
    const distDir = join(appDir, '.next')

    beforeAll(async () => {
      await remove(distDir)
    })

    it('should build and export', async () => {
      await nextBuild(appDir)
      await nextExportDefault(appDir)
    })

    it('should have the expected outputs for export', () => {
      expect(
        JSON.parse(fs.readFileSync(join(distDir, 'export-marker.json'), 'utf8'))
      ).toMatchInlineSnapshot(`
        Object {
          "exportTrailingSlash": false,
          "hasExportPathMap": false,
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
        Object {
          "outDirectory": "out",
          "success": false,
          "version": 1,
        }
      `)
    })
  })

  describe('No Export', () => {
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
        JSON.parse(fs.readFileSync(join(distDir, 'export-marker.json'), 'utf8'))
      ).toMatchInlineSnapshot(`
        Object {
          "exportTrailingSlash": false,
          "hasExportPathMap": false,
          "version": 1,
        }
      `)

      expect(() => {
        fs.readFileSync(join(distDir, 'export-detail.json'), 'utf8')
      }).toThrowError(/ENOENT/)
    })

    it('should export and create file', async () => {
      await nextExportDefault(appDir)

      expect(() => {
        fs.readFileSync(join(distDir, 'export-detail.json'), 'utf8')
      }).not.toThrow()
    })

    it('should build and clean up', async () => {
      await nextBuild(appDir)

      expect(() => {
        fs.readFileSync(join(distDir, 'export-detail.json'), 'utf8')
      }).toThrowError(/ENOENT/)
    })
  })
})
