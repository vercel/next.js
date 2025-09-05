import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'e2e-utils'
import { assertHasRedbox, getRedboxSource } from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'

describe('font-loader-in-document-error', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        pages: new FileRef(join(__dirname, 'font-loader-in-document/pages')),
      },
    })
  })
  afterAll(() => next.destroy())

  test('next/font inside _document', async () => {
    const browser = await webdriver(next.url, '/')
    await assertHasRedbox(browser)
    if (process.env.IS_TURBOPACK_TEST) {
      // TODO: Turbopack doesn't include pages/
      expect(await getRedboxSource(browser)).toMatchInlineSnapshot(`
        "./_document.js
        next/font: error:
        Cannot be used within _document.js"
      `)
    } else if (process.env.NEXT_RSPACK) {
      expect(await getRedboxSource(browser)).toMatchInlineSnapshot(`
       "pages/_document.js
         × \`next/font\` error:
         │ Cannot be used within pages/_document.js.
         │     at /private/var/folders/b1/0fd1b6hs7lz0fm_mh346lybm0000gn/T/next-install-4d5c5dd2e7fe2d60f877300cdf94eaf0e8b0ed2083bc683eefd5a9b3ec7e3bf4/node_modules/.pnpm/next@file+..+next-repo-f07fe8f4d9bb94aa8db5251d498e95b7cd8dc7ada7f16b17214e0268c744f536+packa_tk4znny4xsxlznglinvyezhsbi/node_modules/next/dist/build/webpack/loaders/next-font-loader/index.js:37:47
         │     at Span.traceAsyncFn (/private/var/folders/b1/0fd1b6hs7lz0fm_mh346lybm0000gn/T/next-install-4d5c5dd2e7fe2d60f877300cdf94eaf0e8b0ed2083bc683eefd5a9b3ec7e3bf4/node_modules/.pnpm/next@file+..+next-repo-f07fe8f4d9bb94aa8db5251d498e95b7cd8dc7ada7f16b17214e0268c744f536+packa_tk4znny4xsxlznglinvyezhsbi/node_modules/next/dist/trace/trace.js:157:26)
         │     at Object.nextFontLoader (/private/var/folders/b1/0fd1b6hs7lz0fm_mh346lybm0000gn/T/next-install-4d5c5dd2e7fe2d60f877300cdf94eaf0e8b0ed2083bc683eefd5a9b3ec7e3bf4/node_modules/.pnpm/next@file+..+next-repo-f07fe8f4d9bb94aa8db5251d498e95b7cd8dc7ada7f16b17214e0268c744f536+packa_tk4znny4xsxlznglinvyezhsbi/node_modules/next/dist/build/webpack/loaders/next-font-loader/index.js:23:31)
         │     at /private/var/folders/b1/0fd1b6hs7lz0fm_mh346lybm0000gn/T/next-install-4d5c5dd2e7fe2d60f877300cdf94eaf0e8b0ed2083bc683eefd5a9b3ec7e3bf4/node_modules/.pnpm/@rspack+core@1.5.0_@swc+helpers@0.5.15/node_modules/@rspack/core/dist/index.js:3051:29
         │     at node:internal/util:435:21
         │     at new Promise (<anonymous>)
         │     at node:internal/util:421:12
         │     at isomorphoicRun (/private/var/folders/b1/0fd1b6hs7lz0fm_mh346lybm0000gn/T/next-install-4d5c5dd2e7fe2d60f877300cdf94eaf0e8b0ed2083bc683eefd5a9b3ec7e3bf4/node_modules/.pnpm/@rspack+core@1.5.0_@swc+helpers@0.5.15/node_modules/@rspack/core/dist/index.js:3550:244)
         │     at runLoaders (/private/var/folders/b1/0fd1b6hs7lz0fm_mh346lybm0000gn/T/next-install-4d5c5dd2e7fe2d60f877300cdf94eaf0e8b0ed2083bc683eefd5a9b3ec7e3bf4/node_modules/.pnpm/@rspack+core@1.5.0_@swc+helpers@0.5.15/node_modules/@rspack/core/dist/index.js:3600:145)"
      `)
    } else {
      expect(await getRedboxSource(browser)).toMatchInlineSnapshot(`
              "pages/_document.js
              \`next/font\` error:
              Cannot be used within pages/_document.js."
          `)
    }
  })
})
