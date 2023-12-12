import { nextTestSetup } from 'e2e-utils'
import { describeVariants as describe } from 'next-test-utils'
import { join } from 'path'
import { readdir, readFile } from 'node:fs/promises'

describe.each(['turbo'])('experimental-lightningcss', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should support css modules', async () => {
    // Recommended for tests that check HTML. Cheerio is a HTML parser that has a jQuery like API.
    const $ = await next.render$('/')
    expect($('p').text()).toBe('hello world')
    // swc_css does not include `-module` in the class name, while lightningcss does.
    expect($('p').attr('class')).toBe(
      'search-keyword style-module__hlQ3RG__blue'
    )
  })
})

// lightningcss produces different class names in turbo mode
describe.each(['default'])(
  'experimental-lightningcss with default mdoe',
  () => {
    describe('in dev server', async () => {
      const { next } = nextTestSetup({
        files: __dirname,
        dependencies: { lightningcss: '^1' },
      })

      it('should support css modules', async () => {
        // Recommended for tests that check HTML. Cheerio is a HTML parser that has a jQuery like API.
        const $ = await next.render$('/')
        expect($('p').text()).toBe('hello world')
        // We remove hash frmo the class name in test mode using env var because it is not deterministic.
        expect($('p').attr('class')).toBe('search-keyword style-module__blue')
      })
    })

    describe('in production build', async () => {
      const { next } = nextTestSetup({
        files: __dirname,
        dependencies: { lightningcss: '^1' },
        build: true,
      })
      const appDir = next.testDir

      // Copied from the css-loader test in next.js
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
  }
)
