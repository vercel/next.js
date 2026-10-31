import { nextTestSetup } from 'e2e-utils'
import path from 'path'

describe('Application Export Intent Output', () => {
  describe('Default Export', () => {
    const { next } = nextTestSetup({
      files: path.join(__dirname, 'fixtures/default-export'),
      skipStart: true,
    })

    it('should build and have expected export outputs', async () => {
      await next.build()

      expect(JSON.parse(await next.readFile('.next/export-marker.json')))
        .toMatchInlineSnapshot(`
        {
          "exportTrailingSlash": false,
          "hasExportPathMap": false,
          "isNextImageImported": false,
          "version": 1,
        }
      `)

      const detail = JSON.parse(await next.readFile('.next/export-detail.json'))
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

  describe('Custom Export', () => {
    const { next } = nextTestSetup({
      files: path.join(__dirname, 'fixtures/custom-export'),
      skipStart: true,
    })

    it('should build and have expected export outputs', async () => {
      await next.build()

      expect(JSON.parse(await next.readFile('.next/export-marker.json')))
        .toMatchInlineSnapshot(`
        {
          "exportTrailingSlash": false,
          "hasExportPathMap": true,
          "isNextImageImported": false,
          "version": 1,
        }
      `)

      const detail = JSON.parse(await next.readFile('.next/export-detail.json'))
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

  describe('Custom Out', () => {
    const { next } = nextTestSetup({
      files: path.join(__dirname, 'fixtures/custom-out'),
      skipStart: true,
    })

    it('should build and have expected export outputs', async () => {
      await next.build()

      expect(JSON.parse(await next.readFile('.next/export-marker.json')))
        .toMatchInlineSnapshot(`
        {
          "exportTrailingSlash": true,
          "hasExportPathMap": false,
          "isNextImageImported": false,
          "version": 1,
        }
      `)

      const detail = JSON.parse(await next.readFile('.next/export-detail.json'))
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
  })

  describe('Bad Export', () => {
    const { next } = nextTestSetup({
      files: path.join(__dirname, 'fixtures/bad-export'),
      skipStart: true,
    })

    it('should fail build with getInitialProps error', async () => {
      const { exitCode } = await next.build()
      expect(exitCode).toBe(1)
      expect(next.cliOutput).toMatch('.getInitialProps()')
    })

    it('should have expected export outputs after failed build', async () => {
      expect(JSON.parse(await next.readFile('.next/export-marker.json')))
        .toMatchInlineSnapshot(`
        {
          "exportTrailingSlash": false,
          "hasExportPathMap": false,
          "isNextImageImported": false,
          "version": 1,
        }
      `)

      const detail = JSON.parse(await next.readFile('.next/export-detail.json'))
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
  })

  describe('No Export', () => {
    const { next } = nextTestSetup({
      files: path.join(__dirname, 'fixtures/no-export'),
      skipStart: true,
    })

    it('should build without export and have expected outputs', async () => {
      await next.build()

      expect(JSON.parse(await next.readFile('.next/export-marker.json')))
        .toMatchInlineSnapshot(`
        {
          "exportTrailingSlash": false,
          "hasExportPathMap": false,
          "isNextImageImported": false,
          "version": 1,
        }
      `)

      expect(await next.hasFile('.next/export-detail.json')).toBe(false)
    })

    it('should not create export-detail.json on rebuild', async () => {
      await next.build()

      expect(await next.hasFile('.next/export-detail.json')).toBe(false)
    })
  })
})
