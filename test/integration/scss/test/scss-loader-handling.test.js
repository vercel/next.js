/* eslint-env jest */

import { readdir, readFile, remove } from 'fs-extra'
import { nextBuild } from 'next-test-utils'
import { join } from 'path'

const fixturesDir = join(__dirname, '../..', 'scss-fixtures')

describe('SCSS Support loader handling', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    describe('CSS URL via `file-loader`', () => {
      const appDir = join(fixturesDir, 'url-global')

      beforeAll(async () => {
        await remove(join(appDir, '.next'))
      })
      it('should compile successfully', async () => {
        const { code, stdout } = await nextBuild(appDir, [], {
          stdout: true,
        })
        // eslint-disable-next-line
        expect(code).toBe(0)
        // eslint-disable-next-line
        expect(stdout).toMatch(/Compiled successfully/)
      })

      it(`should've emitted expected files`, async () => {
        const cssFolder = join(appDir, '.next/static/css')
        const mediaFolder = join(appDir, '.next/static/media')

        const files = await readdir(cssFolder)
        const cssFiles = files.filter((f) => /\.css$/.test(f))

        expect(cssFiles.length).toBe(1)
        const cssContent = await readFile(join(cssFolder, cssFiles[0]), 'utf8')
        expect(cssContent.replace(/\/\*.*?\*\//g, '').trim()).toMatch(
          /^\.red-text\{color:red;background-image:url\(\/_next\/static\/media\/dark\.[a-f0-9]{8}\.svg\) url\(\/_next\/static\/media\/dark2\.[a-f0-9]{8}\.svg\)\}\.blue-text\{color:orange;font-weight:bolder;background-image:url\(\/_next\/static\/media\/light\.[a-f0-9]{8}\.svg\);color:blue\}$/
        )

        const mediaFiles = await readdir(mediaFolder)
        expect(mediaFiles.length).toBe(3)
        expect(
          mediaFiles
            .map((fileName) =>
              /^(.+?)\..{8}\.(.+?)$/.exec(fileName).slice(1).join('.')
            )
            .sort()
        ).toMatchInlineSnapshot(`
          [
            "dark.svg",
            "dark2.svg",
            "light.svg",
          ]
        `)
      })
    })

    describe('CSS URL via file-loader sass partial', () => {
      const appDir = join(fixturesDir, 'url-global-partial')

      beforeAll(async () => {
        await remove(join(appDir, '.next'))
      })
      it('should compile successfully', async () => {
        const { code, stdout } = await nextBuild(appDir, [], {
          stdout: true,
        })
        // eslint-disable-next-line
        expect(code).toBe(0)
        // eslint-disable-next-line
        expect(stdout).toMatch(/Compiled successfully/)
      })

      it(`should've emitted expected files`, async () => {
        const cssFolder = join(appDir, '.next/static/css')
        const mediaFolder = join(appDir, '.next/static/media')

        const files = await readdir(cssFolder)
        const cssFiles = files.filter((f) => /\.css$/.test(f))

        expect(cssFiles.length).toBe(1)
        const cssContent = await readFile(join(cssFolder, cssFiles[0]), 'utf8')
        expect(
          cssContent.replace(/\/\*.*?\*\//g, '').trim()
        ).toMatchInlineSnapshot(
          '".red-text{color:red;background-image:url(/_next/static/media/darka.6b01655b.svg),url(/_next/static/media/darkb.6b01655b.svg)}.blue-text{color:orange;font-weight:bolder;background-image:url(/_next/static/media/light.2da1d3d6.svg);color:blue}"'
        )

        const mediaFiles = await readdir(mediaFolder)
        expect(mediaFiles.length).toBe(3)
        expect(
          mediaFiles
            .map((fileName) =>
              /^(.+?)\..{8}\.(.+?)$/.exec(fileName).slice(1).join('.')
            )
            .sort()
        ).toMatchInlineSnapshot(`
          [
            "darka.svg",
            "darkb.svg",
            "light.svg",
          ]
        `)
      })
    })

    describe('CSS URL via `file-loader` and asset prefix (1)', () => {
      const appDir = join(fixturesDir, 'url-global-asset-prefix-1')

      beforeAll(async () => {
        await remove(join(appDir, '.next'))
      })
      it('should compile successfully', async () => {
        const { code, stdout } = await nextBuild(appDir, [], {
          stdout: true,
        })
        // eslint-disable-next-line
        expect(code).toBe(0)
        // eslint-disable-next-line
        expect(stdout).toMatch(/Compiled successfully/)
      })

      it(`should've emitted expected files`, async () => {
        const cssFolder = join(appDir, '.next/static/css')
        const mediaFolder = join(appDir, '.next/static/media')

        const files = await readdir(cssFolder)
        const cssFiles = files.filter((f) => /\.css$/.test(f))

        expect(cssFiles.length).toBe(1)
        const cssContent = await readFile(join(cssFolder, cssFiles[0]), 'utf8')
        expect(cssContent.replace(/\/\*.*?\*\//g, '').trim()).toMatch(
          /^\.red-text\{color:red;background-image:url\(\/foo\/_next\/static\/media\/dark\.[a-f0-9]{8}\.svg\) url\(\/foo\/_next\/static\/media\/dark2\.[a-f0-9]{8}\.svg\)\}\.blue-text\{color:orange;font-weight:bolder;background-image:url\(\/foo\/_next\/static\/media\/light\.[a-f0-9]{8}\.svg\);color:blue\}$/
        )

        const mediaFiles = await readdir(mediaFolder)
        expect(mediaFiles.length).toBe(3)
        expect(
          mediaFiles
            .map((fileName) =>
              /^(.+?)\..{8}\.(.+?)$/.exec(fileName).slice(1).join('.')
            )
            .sort()
        ).toMatchInlineSnapshot(`
          [
            "dark.svg",
            "dark2.svg",
            "light.svg",
          ]
        `)
      })
    })

    describe('CSS URL via `file-loader` and asset prefix (2)', () => {
      const appDir = join(fixturesDir, 'url-global-asset-prefix-2')

      beforeAll(async () => {
        await remove(join(appDir, '.next'))
      })
      it('should compile successfully', async () => {
        const { code, stdout } = await nextBuild(appDir, [], {
          stdout: true,
        })
        // eslint-disable-next-line
        expect(code).toBe(0)
        // eslint-disable-next-line
        expect(stdout).toMatch(/Compiled successfully/)
      })

      it(`should've emitted expected files`, async () => {
        const cssFolder = join(appDir, '.next/static/css')
        const mediaFolder = join(appDir, '.next/static/media')

        const files = await readdir(cssFolder)
        const cssFiles = files.filter((f) => /\.css$/.test(f))

        expect(cssFiles.length).toBe(1)
        const cssContent = await readFile(join(cssFolder, cssFiles[0]), 'utf8')
        expect(cssContent.replace(/\/\*.*?\*\//g, '').trim()).toMatch(
          /^\.red-text\{color:red;background-image:url\(\/foo\/_next\/static\/media\/dark\.[a-f0-9]{8}\.svg\) url\(\/foo\/_next\/static\/media\/dark2\.[a-f0-9]{8}\.svg\)\}\.blue-text\{color:orange;font-weight:bolder;background-image:url\(\/foo\/_next\/static\/media\/light\.[a-f0-9]{8}\.svg\);color:blue\}$/
        )

        const mediaFiles = await readdir(mediaFolder)
        expect(mediaFiles.length).toBe(3)
        expect(
          mediaFiles
            .map((fileName) =>
              /^(.+?)\..{8}\.(.+?)$/.exec(fileName).slice(1).join('.')
            )
            .sort()
        ).toMatchInlineSnapshot(`
          [
            "dark.svg",
            "dark2.svg",
            "light.svg",
          ]
        `)
      })
    })

    describe('Data Urls', () => {
      const appDir = join(fixturesDir, 'data-url')

      beforeAll(async () => {
        await remove(join(appDir, '.next'))
      })
      it('should compile successfully', async () => {
        const { code, stdout } = await nextBuild(appDir, [], {
          stdout: true,
        })
        // eslint-disable-next-line
        expect(code).toBe(0)
        // eslint-disable-next-line
        expect(stdout).toMatch(/Compiled successfully/)
      })

      it(`should've emitted expected files`, async () => {
        const cssFolder = join(appDir, '.next/static/css')

        const files = await readdir(cssFolder)
        const cssFiles = files.filter((f) => /\.css$/.test(f))

        expect(cssFiles.length).toBe(1)
        const cssContent = await readFile(join(cssFolder, cssFiles[0]), 'utf8')
        expect(cssContent.replace(/\/\*.*?\*\//g, '').trim()).toMatch(
          /^\.red-text\{color:red;background-image:url\("data:[^"]+"\)\}$/
        )
      })
    })

    describe('External imports', () => {
      const appDir = join(fixturesDir, 'external-url')

      beforeAll(async () => {
        await remove(join(appDir, '.next'))
      })
      it('should compile successfully', async () => {
        const { code, stdout } = await nextBuild(appDir, [], {
          stdout: true,
        })
        // eslint-disable-next-line
        expect(code).toBe(0)
        // eslint-disable-next-line
        expect(stdout).toMatch(/Compiled successfully/)
      })

      it(`should've emitted expected files`, async () => {
        const cssFolder = join(appDir, '.next/static/css')

        const files = await readdir(cssFolder)
        const cssFiles = files.filter((f) => /\.css$/.test(f))

        expect(cssFiles.length).toBe(1)
        const cssContent = await readFile(join(cssFolder, cssFiles[0]), 'utf8')
        expect(cssContent.replace(/\/\*.*?\*\//g, '').trim()).toMatch(
          /^@import"https:\/\/fonts\.googleapis\.com\/css2\?family=Poppins:wght@400&display=swap";\.red-text\{color:red;font-family:Poppins;font-style:normal;font-weight:400\}$/
        )
      })
    })

    describe('Preprocessor loader order', () => {
      const appDir = join(fixturesDir, 'loader-order')

      beforeAll(async () => {
        await remove(join(appDir, '.next'))
      })
      it('should compile successfully', async () => {
        const { stdout } = await nextBuild(appDir, [], {
          stdout: true,
        })
        // eslint-disable-next-line
        expect(stdout).toMatch(/Compiled successfully/)
      })
    })
  })
})
