import { join } from 'path'
import cheerio from 'cheerio'
import webdriver from 'next-webdriver'
import { createNext, FileRef } from 'e2e-utils'
import { assertNoRedbox, renderViaHTTP, check } from 'next-test-utils'
import { NextInstance } from 'e2e-utils'

const customDocumentGipContent = `\
import { Html, Main, NextScript, Head } from 'next/document'

export default function Document() {
  return (
    <Html>
      <Head />
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}

Document.getInitialProps = (ctx) => {
  return ctx.defaultGetInitialProps(ctx)
}
`

const basePath = process.env.TEST_BASE_PATH || ''
const srcPrefix = process.env.TEST_SRC_DIR ? 'src/' : ''

describe('next/dynamic', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        [`${srcPrefix}/components`]: new FileRef(join(__dirname, 'components')),
        [`${srcPrefix}/pages`]: new FileRef(join(__dirname, 'pages')),
        ...(process.env.TEST_CUSTOMIZED_DOCUMENT === '1' && {
          [`${srcPrefix}/pages/_document.js`]: customDocumentGipContent,
        }),
        // When it's not turbopack and babel is enabled, we add a .babelrc file.
        ...(!process.env.IS_TURBOPACK_TEST &&
          process.env.TEST_BABEL === '1' && {
            '.babelrc': `{ "presets": ["next/babel"] }`,
          }),
      },
      nextConfig: {
        basePath,
      },
    })
  })
  afterAll(() => next.destroy())

  async function get$(path, query?: any) {
    const html = await renderViaHTTP(next.url, path, query)
    return cheerio.load(html)
  }

  // Turbopack doesn't support babel.
  ;(process.env.IS_TURBOPACK_TEST && process.env.TEST_BABEL === '1'
    ? describe.skip
    : describe)('Dynamic import', () => {
    describe('default behavior', () => {
      it('should render dynamic import components', async () => {
        const $ = await get$(basePath + '/dynamic/ssr')
        // Make sure the client side knows it has to wait for the bundle
        expect(JSON.parse($('#__NEXT_DATA__').html()).dynamicIds).toContain(
          process.env.IS_TURBOPACK_TEST
            ? '[project]/components/hello1.js [client] (ecmascript, next/dynamic entry)'
            : 'pages/dynamic/ssr.js -> ../../components/hello1'
        )
        expect($('body').text()).toMatch(/Hello World 1/)
      })

      it('should render dynamic import components using a function as first parameter', async () => {
        const $ = await get$(basePath + '/dynamic/function')
        // Make sure the client side knows it has to wait for the bundle
        expect(JSON.parse($('#__NEXT_DATA__').html()).dynamicIds).toContain(
          process.env.IS_TURBOPACK_TEST
            ? '[project]/components/hello1.js [client] (ecmascript, next/dynamic entry)'
            : 'pages/dynamic/function.js -> ../../components/hello1'
        )
        expect($('body').text()).toMatch(/Hello World 1/)
      })

      it('should render even there are no physical chunk exists', async () => {
        let browser
        try {
          browser = await webdriver(next.url, basePath + '/dynamic/no-chunk')
          await check(
            () => browser.elementByCss('body').text(),
            /Welcome, normal/
          )
          await check(
            () => browser.elementByCss('body').text(),
            /Welcome, dynamic/
          )
        } finally {
          if (browser) {
            await browser.close()
          }
        }
      })

      it('should SSR nested dynamic components and skip nonSSR ones', async () => {
        const $ = await get$(basePath + '/dynamic/nested')
        const text = $('#__next').text()
        expect(text).toContain('Nested 1')
        expect(text).toContain('Nested 2')
        expect(text).not.toContain('Browser hydrated')
      })

      it('should hydrate nested chunks', async () => {
        let browser
        try {
          browser = await webdriver(next.url, basePath + '/dynamic/nested')
          await check(() => browser.elementByCss('body').text(), /Nested 1/)
          await check(() => browser.elementByCss('body').text(), /Nested 2/)
          await check(
            () => browser.elementByCss('body').text(),
            /Browser hydrated/
          )

          if ((global as any).browserName === 'chrome') {
            const logs = await browser.log()

            logs.forEach((logItem) => {
              expect(logItem.message).not.toMatch(
                /Expected server HTML to contain/
              )
            })
          }
        } finally {
          if (browser) {
            await browser.close()
          }
        }
      })

      it('should render the component Head content', async () => {
        let browser
        try {
          browser = await webdriver(next.url, basePath + '/dynamic/head')
          await check(() => browser.elementByCss('body').text(), /test/)
          const backgroundColor = await browser
            .elementByCss('.dynamic-style')
            .getComputedCss('background-color')
          const height = await browser
            .elementByCss('.dynamic-style')
            .getComputedCss('height')
          expect(height).toBe('200px')
          expect(backgroundColor).toMatch(/rgba?\(0, 128, 0/)
        } finally {
          if (browser) {
            await browser.close()
          }
        }
      })
    })
    describe('ssr:false option', () => {
      it('should not render loading on the server side', async () => {
        const $ = await get$(basePath + '/dynamic/no-ssr')
        expect($('body').html()).not.toContain('"dynamicIds"')
        expect($('body').text()).not.toMatch('loading...')
      })

      it('should render the component on client side', async () => {
        let browser
        try {
          browser = await webdriver(next.url, basePath + '/dynamic/no-ssr')
          await check(() => browser.elementByCss('body').text(), /navigator/)
          await assertNoRedbox(browser)
        } finally {
          if (browser) {
            await browser.close()
          }
        }
      })

      it('should import and render the ESM module correctly on client side', async () => {
        let browser
        try {
          browser = await webdriver(next.url, basePath + '/dynamic/no-ssr-esm')
          await check(() => browser.elementByCss('body').text(), /esm.mjs/)
          await assertNoRedbox(browser)
        } finally {
          if (browser) {
            await browser.close()
          }
        }
      })
    })

    describe('ssr:true option', () => {
      it('Should render the component on the server side', async () => {
        const $ = await get$(basePath + '/dynamic/ssr-true')
        expect($('body').html()).toContain('"dynamicIds"')
        expect($('p').text()).toBe('Hello World 1')
      })

      it('should render the component on client side', async () => {
        let browser
        try {
          browser = await webdriver(next.url, basePath + '/dynamic/ssr-true')
          await check(
            () => browser.elementByCss('body').text(),
            /Hello World 1/
          )
        } finally {
          if (browser) {
            await browser.close()
          }
        }
      })

      if (!(global as any).isNextDev) {
        it('should not include ssr:false imports to server trace', async () => {
          const trace = JSON.parse(
            await next.readFile('.next/server/pages/dynamic/no-ssr.js.nft.json')
          ) as { files: string[] }
          expect(trace).not.toContain('navigator')
        })
      }
    })
    // Turbopack doesn't have this feature.
    ;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
      'custom chunkfilename',
      () => {
        it('should render the correct filename', async () => {
          const $ = await get$(basePath + '/dynamic/chunkfilename')
          expect($('body').text()).toMatch(/test chunkfilename/)
          expect($('html').html()).toMatch(/hello-world\.js/)
        })

        it('should render the component on client side', async () => {
          let browser
          try {
            browser = await webdriver(
              next.url,
              basePath + '/dynamic/chunkfilename'
            )
            await check(
              () => browser.elementByCss('body').text(),
              /test chunkfilename/
            )
          } finally {
            if (browser) {
              await browser.close()
            }
          }
        })
      }
    )

    describe('custom loading', () => {
      it('should render custom loading on the server side when `ssr:false` and `loading` is provided', async () => {
        const $ = await get$(basePath + '/dynamic/no-ssr-custom-loading')
        expect($('p').text()).toBe('LOADING')
      })

      it('should render the component on client side', async () => {
        let browser
        try {
          browser = await webdriver(
            next.url,
            basePath + '/dynamic/no-ssr-custom-loading'
          )
          await check(
            () => browser.elementByCss('body').text(),
            /Hello World 1/
          )
        } finally {
          if (browser) {
            await browser.close()
          }
        }
      })
    })

    // TODO: Make this test work with Turbopack. Currently the test relies on `chunkFileName` which is not supported by Turbopack.
    ;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
      'Multiple modules',
      () => {
        it('should only include the rendered module script tag', async () => {
          const $ = await get$(basePath + '/dynamic/multiple-modules')
          const html = $('html').html()
          expect(html).toMatch(/hello1\.js/)
          expect(html).not.toMatch(/hello2\.js/)
        })

        it('should only load the rendered module in the browser', async () => {
          let browser
          try {
            browser = await webdriver(
              next.url,
              basePath + '/dynamic/multiple-modules'
            )
            const html = await browser.eval(
              'document.documentElement.innerHTML'
            )
            expect(html).toMatch(/hello1\.js/)
            expect(html).not.toMatch(/hello2\.js/)
          } finally {
            if (browser) {
              await browser.close()
            }
          }
        })

        it('should only render one bundle if component is used multiple times', async () => {
          const $ = await get$(basePath + '/dynamic/multiple-modules')
          const html = $('html').html()
          try {
            expect(html.match(/chunks[\\/]hello1\.js/g).length).toBe(1)
            expect(html).not.toMatch(/hello2\.js/)
          } catch (err) {
            console.error(html)
            throw err
          }
        })
      }
    )
  })
})
