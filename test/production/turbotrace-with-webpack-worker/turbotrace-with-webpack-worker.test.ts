import path from 'path'
import { nextTestSetup } from 'e2e-utils'

describe('build trace with extra entries', () => {
  ;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
    'production mode',
    () => {
      const { next, skipped } = nextTestSetup({
        files: path.join(__dirname, 'app'),
        skipStart: true,
        skipDeployment: true,
      })
      if (skipped) return

      it('should build and trace correctly', async () => {
        const { exitCode } = await next.build()
        console.log(next.cliOutput)
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
          tracedFiles.some((file) => file === '../../../include-me/second.txt')
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
})
