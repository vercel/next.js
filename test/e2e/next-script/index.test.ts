import webdriver from 'next-webdriver'
import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { BrowserInterface } from 'test/lib/browsers/base'
import { check } from 'next-test-utils'

describe('beforeInteractive in document Head', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        'pages/_document.js': `
          import { Html, Head, Main, NextScript } from 'next/document'
          import Script from 'next/script'

          export default function Document() {
            return (
              <Html>
                <Head>
                  <Script
                    src="https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.20/lodash.min.js"
                    strategy="beforeInteractive"
                  ></Script>
                </Head>
                <body>
                  <Main />
                  <NextScript />
                </body>
              </Html>
            )
          }
        `,
        'pages/index.js': `
          export default function Home() {
            return (
              <>
                <p>Home page</p>
              </>
            )
          }
        `,
      },
      dependencies: {
        react: 'latest',
        'react-dom': 'latest',
      },
    })
  })
  afterAll(() => next.destroy())

  it('Script is injected server-side', async () => {
    let browser: BrowserInterface

    try {
      browser = await webdriver(next.url, '/')

      const script = await browser.eval(
        `document.querySelector('script[data-nscript="beforeInteractive"]')`
      )
      expect(script).not.toBeNull()
    } finally {
      if (browser) await browser.close()
    }
  })
})

describe('beforeInteractive in document body', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        'pages/_document.js': `
          import { Html, Head, Main, NextScript } from 'next/document'
          import Script from 'next/script'

          export default function Document() {
            return (
              <Html>
                <Head />
                <body>
                  <Main />
                  <NextScript />
                  <Script
                    src="https://www.google-analytics.com/analytics.js"
                    strategy="beforeInteractive"
                  />
                </body>
              </Html>
            )
          }
        `,
        'pages/index.js': `
          export default function Home() {
            return (
              <>
                <p>Home page</p>
              </>
            )
          }
        `,
      },
      dependencies: {
        react: 'latest',
        'react-dom': 'latest',
      },
    })
  })
  afterAll(() => next.destroy())

  it('Script is injected server-side', async () => {
    let browser: BrowserInterface

    try {
      browser = await webdriver(next.url, '/')

      const script = await browser.eval(
        `document.querySelector('script[data-nscript="beforeInteractive"]')`
      )

      expect(script).not.toBeNull()
    } finally {
      if (browser) await browser.close()
    }
  })
})
;(process.env.TURBOPACK ? describe.skip : describe)(
  'experimental.nextScriptWorkers',
  () => {
    describe('experimental.nextScriptWorkers: false with no Partytown dependency', () => {
      let next: NextInstance

      beforeAll(async () => {
        next = await createNext({
          files: {
            'pages/index.js': `
          import Script from 'next/script'

          export default function Page() {
            return (
              <>
                <Script
                  src="https://cdn.jsdelivr.net/npm/cookieconsent@3/build/cookieconsent.min.js"
                  strategy="worker"
                />
              </>
            )
          }
        `,
          },
          // TODO: @housseindjirdeh: verify React 18 functionality
          dependencies: {
            react: 'latest',
            'react-dom': 'latest',
          },
        })
      })
      afterAll(() => next.destroy())

      it('Partytown snippet is not injected to head if not enabled in configuration', async () => {
        let browser: BrowserInterface

        try {
          browser = await webdriver(next.url, '/')

          const snippetScript = await browser.eval(
            `document.querySelector('script[data-partytown]')`
          )

          expect(snippetScript).toEqual(null)
        } finally {
          if (browser) await browser.close()
        }
      })
    })

    describe('experimental.nextScriptWorkers: true with required Partytown dependency for external script', () => {
      let next: NextInstance

      beforeAll(async () => {
        next = await createNext({
          nextConfig: {
            experimental: {
              nextScriptWorkers: true,
            },
          },
          files: {
            'pages/index.js': `
          import Script from 'next/script'

          export default function Page() {
            return (
              <>
                <Script
                  src="https://cdn.jsdelivr.net/npm/cookieconsent@3/build/cookieconsent.min.js"
                  strategy="worker"
                />
              </>
            )
          }
        `,
          },
          dependencies: {
            react: 'latest',
            'react-dom': 'latest',
            '@builder.io/partytown': '0.4.2',
          },
        })
      })
      afterAll(() => next.destroy())

      it('Partytown snippets are injected to head if enabled in configuration', async () => {
        let browser: BrowserInterface

        try {
          browser = await webdriver(next.url, '/')

          const snippetScript = await browser.eval(
            `document.querySelector('script[data-partytown]').innerHTML`
          )
          const configScript = await browser.eval(
            `document.querySelector('script[data-partytown-config]').innerHTML`
          )

          expect(snippetScript).not.toEqual(null)

          // A default config is included that points to the correct folder that hosts partytown's static files
          expect(configScript).not.toEqual(null)
          expect(configScript.replace(/(?: *[\n\r])+ */g, '')).toEqual(
            'partytown = {lib: "/_next/static/~partytown/"};'
          )
        } finally {
          if (browser) await browser.close()
        }
      })

      it('Worker scripts are modified by Partytown to execute on a worker thread', async () => {
        let browser: BrowserInterface

        try {
          browser = await webdriver(next.url, '/')

          // Partytown modifies type to "text/partytown-x" after it has been executed in the web worker
          await check(async () => {
            const processedWorkerScripts = await browser.eval(
              `document.querySelectorAll('script[type="text/partytown-x"]').length`
            )
            return processedWorkerScripts > 0
              ? 'success'
              : processedWorkerScripts
          }, 'success')
        } finally {
          if (browser) await browser.close()
        }
      })
    })

    describe('experimental.nextScriptWorkers: true with required Partytown dependency for inline script', () => {
      let next: NextInstance

      // Note: previously we were using `finally` cluase inside of test assertion. However, if the test times out
      // exceeding jest.setTimeout() value, the finally clause is not executed and subsequent tests will fail due to
      // hanging next instance.
      afterEach(async () => {
        if (next) {
          await next.destroy()
          next = undefined
        }
      })

      const createNextApp = async (script) =>
        await createNext({
          nextConfig: {
            experimental: {
              nextScriptWorkers: true,
            },
          },
          files: {
            'pages/index.js': `
        import Script from 'next/script'

        export default function Page() {
          return (
            <>
              ${script}
              <div id="text" />
            </>
          )
        }
      `,
          },
          dependencies: {
            react: 'latest',
            'react-dom': 'latest',
            '@builder.io/partytown': '0.4.2',
          },
        })

      it('Inline worker script through children is modified by Partytown to execute on a worker thread', async () => {
        let browser: BrowserInterface

        next = await createNextApp(
          `<Script id="inline-script" strategy="worker">{"document.getElementById('text').textContent += 'abc'"}</Script>`
        )

        try {
          browser = await webdriver(next.url, '/')

          // Partytown modifies type to "text/partytown-x" after it has been executed in the web worker
          await check(async () => {
            const processedWorkerScripts = await browser.eval(
              `document.querySelectorAll('script[type="text/partytown-x"]').length`
            )
            return processedWorkerScripts + ''
          }, '1')

          const text = await browser.elementById('text').text()
          expect(text).toBe('abc')
        } finally {
          if (browser) await browser.close()
        }
      })

      it('Inline worker script through dangerouslySetInnerHtml is modified by Partytown to execute on a worker thread', async () => {
        let browser: BrowserInterface

        next = await createNextApp(
          `<Script id="inline-script" strategy="worker" dangerouslySetInnerHTML={{__html: "document.getElementById('text').textContent += 'abcd'"}}/>`
        )

        try {
          browser = await webdriver(next.url, '/')

          // Partytown modifies type to "text/partytown-x" after it has been executed in the web worker
          await check(async () => {
            const processedWorkerScripts = await browser.eval(
              `document.querySelectorAll('script[type="text/partytown-x"]').length`
            )
            return processedWorkerScripts + ''
          }, '1')

          const text = await browser.elementById('text').text()
          expect(text).toBe('abcd')
        } finally {
          if (browser) await browser.close()
        }
      })
    })

    describe('experimental.nextScriptWorkers: true with config override', () => {
      let next: NextInstance

      beforeAll(async () => {
        next = await createNext({
          nextConfig: {
            experimental: {
              nextScriptWorkers: true,
            },
          },
          files: {
            'pages/_document.js': `
        import Document, { Html, Head, Main, NextScript } from "next/document";

        class MyDocument extends Document {
          render() {
            return (
              <Html>
                <Head>
                  <script
                    data-partytown-config
                    dangerouslySetInnerHTML={{
                      __html: \`
                      partytown = {
                        lib: "/_next/static/~partytown/",
                        debug: true
                      };
                    \`,
                    }}
                  />
                </Head>
                <body>
                  <Main />
                  <NextScript />
                </body>
              </Html>
            );
          }
        }

        export default MyDocument;
        `,
            'pages/index.js': `
          import Script from 'next/script'

          export default function Page() {
            return (
              <>
                <Script
                  src="https://cdn.jsdelivr.net/npm/cookieconsent@3/build/cookieconsent.min.js"
                  strategy="worker"
                />
              </>
            )
          }
        `,
          },
          dependencies: {
            '@builder.io/partytown': '0.4.2',
            react: 'latest',
            'react-dom': 'latest',
          },
        })
      })
      afterAll(() => next.destroy())

      it('Partytown config script is overwritten', async () => {
        let browser: BrowserInterface

        try {
          browser = await webdriver(next.url, '/')

          const configScript = await browser.eval(
            `document.querySelector('script[data-partytown-config]').innerHTML`
          )

          expect(configScript).not.toEqual(null)
          expect(configScript.replace(/(?: *[\n\r])+ */g, '')).toEqual(
            'partytown = {lib: "/_next/static/~partytown/",debug: true};'
          )
        } finally {
          if (browser) await browser.close()
        }
      })
    })
  }
)
