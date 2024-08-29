import { nextTestSetup } from 'e2e-utils'
import { join } from 'node:path'
import { readdir } from 'node:fs/promises'

describe('css-module-with-next-dynamic-and-static-import', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should have the static css file in build-manifest', async () => {
    const buildManifest: { pages: { [key: string]: string[] } } =
      await next.readJSON('.next/build-manifest.json')

    // We only have one css file at components/red.module.css,
    // and our pages/* files import this css file. So we expect
    // the build-manifest.json to have this static css file.
    const staticCSSFile = (
      await readdir(join(next.testDir, '.next/static/css'))
    )[0]

    // `buildManifest.pages` is an array of static file paths.
    // {
    //   pages: {
    //     '/': [
    //       'static/chunks/...js',
    //       'static/css/...css',
    //     ],
    //     '/dynamic-import': [
    //       'static/chunks/...js',
    //       'static/css/...css',
    //     ]
    //   }
    // }
    expect(
      buildManifest.pages['/'].some((file) => file.endsWith(staticCSSFile))
    ).toBe(true)

    expect(
      buildManifest.pages['/dynamic-import'].some((file) =>
        file.endsWith(staticCSSFile)
      )
    ).toBe(true)

    expect(
      buildManifest.pages['/variable-inserted-dynamic-import'].some((file) =>
        file.endsWith(staticCSSFile)
      )
    ).toBe(true)

    expect(
      buildManifest.pages['/next-dynamic'].some((file) =>
        file.endsWith(staticCSSFile)
      )
    ).toBe(true)

    expect(
      buildManifest.pages['/variable-inserted-next-dynamic'].some((file) =>
        file.endsWith(staticCSSFile)
      )
    ).toBe(true)
  })
})
