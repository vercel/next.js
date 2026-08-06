import path from 'path'
import { nextTestSetup } from 'e2e-utils'

describe('build trace with extra entries', () => {
  describe('production mode', () => {
    const { next, isNextStart, isTurbopack } = nextTestSetup({
      files: path.join(__dirname, 'app'),
      skipStart: true,
    })

    if (!isNextStart || isTurbopack) {
      it('skipped for non-start or turbopack mode', () => {})
      return
    }

    it('should build and trace correctly', async () => {
      const { exitCode } = await next.build()
      expect(exitCode).toBe(0)

      const appTrace = JSON.parse(
        await next.readFile('.next/server/pages/_app.js.nft.json')
      )
      const indexTrace = JSON.parse(
        await next.readFile('.next/server/pages/index.js.nft.json')
      )
      const anotherTrace = JSON.parse(
        await next.readFile('.next/server/pages/another.js.nft.json')
      )
      const imageTrace = JSON.parse(
        await next.readFile('.next/server/pages/image-import.js.nft.json')
      )
      const appDirRoute1Trace = JSON.parse(
        await next.readFile('.next/server/app/route1/route.js.nft.json')
      )

      expect(appDirRoute1Trace.files).toContain(
        '../../../../include-me/hello.txt'
      )
      expect(appDirRoute1Trace.files).toContain(
        '../../../../include-me/second.txt'
      )
      expect(
        appDirRoute1Trace.files.some(
          (file: string) => file === '../../../../include-me-global.txt'
        )
      ).toBe(true)
      expect(
        appDirRoute1Trace.files.some((file: string) =>
          file.includes('exclude-me')
        )
      ).toBe(false)
      expect(appDirRoute1Trace.files).toEqual(
        expect.arrayContaining([
          '../../../../node_modules/pkg-behind-symlink/index.js',
          '../../../../node_modules/pkg-behind-symlink/package.json',
        ])
      )
      expect(
        appDirRoute1Trace.files.some((file: string) =>
          file.startsWith('../../../../node_modules/pkg/')
        )
      ).toBe(false)

      expect(
        indexTrace.files.filter(
          (file: string) => file.includes('chunks') && file.endsWith('.js')
        ).length
      ).toBeGreaterThan(
        anotherTrace.files.filter(
          (file: string) => file.includes('chunks') && file.endsWith('.js')
        ).length
      )

      if (!isTurbopack) {
        expect(
          appTrace.files.some((file: string) => file.endsWith('hello.json'))
        ).toBe(true)
      }
      if (!isTurbopack) {
        expect(
          appTrace.files.some((file: string) =>
            file.endsWith('lib/get-data.js')
          )
        ).toBe(true)
      }
      expect(
        appTrace.files.some(
          (file: string) => file === '../../../include-me-global.txt'
        )
      ).toBe(true)

      expect(
        indexTrace.files.some((file: string) => file.endsWith('hello.json'))
      ).toBeFalsy()
      expect(
        indexTrace.files.some((file: string) => file.endsWith('some-dir'))
      ).toBeFalsy()
      expect(
        indexTrace.files.some((file: string) =>
          file.endsWith('.dot-folder/another-file.txt')
        )
      ).toBe(true)
      expect(
        indexTrace.files.some((file: string) =>
          file.endsWith('some-dir/file.txt')
        )
      ).toBe(true)
      expect(
        indexTrace.files.some((file: string) =>
          file.includes('some-cms/index.js')
        )
      ).toBe(true)
      expect(indexTrace.files).toContain('../../../include-me/hello.txt')
      expect(indexTrace.files).toContain('../../../include-me/second.txt')
      expect(
        indexTrace.files.some((file: string) => file.includes('exclude-me'))
      ).toBe(false)
      expect(
        indexTrace.files.some(
          (file: string) => file === '../../../include-me-global.txt'
        )
      ).toBe(true)

      expect(
        anotherTrace.files.some((file: string) =>
          file.includes('nested-structure/constants/package.json')
        )
      ).toBe(true)
      expect(
        anotherTrace.files.some((file: string) =>
          file.includes('nested-structure/package.json')
        )
      ).toBe(true)
      expect(
        anotherTrace.files.some((file: string) =>
          file.includes('nested-structure/dist/constants.js')
        )
      ).toBe(true)
      expect(
        anotherTrace.files.some(
          (file: string) => file === '../../../include-me-global.txt'
        )
      ).toBe(true)

      expect(
        imageTrace.files.some((file: string) =>
          file.includes('public/another.jpg')
        )
      ).toBe(true)
      expect(
        imageTrace.files.some((file: string) =>
          file.includes('public/test.jpg')
        )
      ).toBe(false)
      expect(
        imageTrace.files.some(
          (file: string) => file === '../../../include-me-global.txt'
        )
      ).toBe(true)
    })
  })
})
