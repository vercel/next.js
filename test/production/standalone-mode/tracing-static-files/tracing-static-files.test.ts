import { nextTestSetup } from 'e2e-utils'

describe('standalone mode - tracing-static-files', () => {
  const dependencies = require('./package.json').dependencies

  const { next } = nextTestSetup({
    files: __dirname,
    dependencies,
    skipStart: true,
  })

  beforeAll(async () => {
    const { exitCode } = await next.build()
    if (exitCode !== 0) throw new Error(`Fixture build failed: ${exitCode}`)
  })

  it('should trace process.cwd calls in node_modules', async () => {
    let trace = await next.readJSON('.next/server/app/page.js.nft.json')

    // should trace process.cwd and relative calls relative to the root
    expect(trace.files).toContain('../../../data/static-from-app-cwd.txt')
    if (process.env.IS_TURBOPACK_TEST) {
      // Webpack doesn't trace these relative reference
      expect(trace.files).toContain(
        '../../../data/static-from-app-rel-join.txt'
      )
      expect(trace.files).toContain(
        '../../../data/static-from-app-rel-read.txt'
      )
    }

    if (process.env.IS_TURBOPACK_TEST) {
      // Webpack doesn't trace these relative reference
      expect(trace.files).toContainEqual(
        expect.stringMatching(/.*\/node_modules\/foo\/foo\.txt$/)
      )
    }

    // should not trace process.cwd or relative calls in node_modules (only relative to file)
    expect(trace.files).not.toContain('../../../app/static-from-pkg.txt')
    expect(trace.files).not.toContain('../../../foo/foo.txt')
  })

  it('should ignore fully dynamic alternatives of fs paths', async () => {
    let trace = await next.readJSON('.next/server/app/page.js.nft.json')

    if (process.env.IS_TURBOPACK_TEST) {
      // `dynamic ?? path.join(process.cwd(), ...)` and a parameter defaulting to
      // `path.join(process.cwd(), ...)` should still trace the known file
      expect(trace.files).toContain('../../../data/static-from-app-nullish.txt')
      expect(trace.files).toContain(
        '../../../data/static-from-app-default-param.txt'
      )
    }

    // the dynamic alternative should not cause the whole project to be traced
    expect(trace.files).not.toContain('../../../data/unrelated.txt')
    expect(trace.files).not.toContain('../../../next.config.js')
  })

  it('should keep dynamic alternatives of fs paths in external packages', async () => {
    let trace = await next.readJSON('.next/server/app/page.js.nft.json')

    // External packages are traced without the project root: `process.cwd()` is
    // unknown there and relative paths resolve from the module's directory, so
    // project files referenced by the package are currently not traced.
    for (const name of [
      'cwd',
      'rel-join',
      'rel-read',
      'nullish',
      'default-param',
    ]) {
      expect(trace.files).not.toContain(
        `../../../data/static-from-ext-${name}.txt`
      )
    }

    if (process.env.IS_TURBOPACK_TEST) {
      // External packages are traced without ignoring dynamic requests, so the
      // dynamic alternatives are kept and traced relative to the reading
      // module's directory, which pulls in otherwise unreferenced files there.
      for (const name of ['nullish', 'default-param', 'bare-dynamic']) {
        expect(trace.files).toContainEqual(
          expect.stringMatching(
            new RegExp(
              `/node_modules/external-dynamic/${name}/sentinel-${name}\\.txt$`
            )
          )
        )
      }
    }

    // ...but they don't cause the whole project to be traced
    expect(trace.files).not.toContain('../../../data/unrelated.txt')
    expect(trace.files).not.toContain('../../../next.config.js')
  })
})
