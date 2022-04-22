import webdriver from 'next-webdriver'
import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { BrowserInterface } from 'test/lib/browsers/base'
import { waitFor } from 'next-test-utils'

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
        react: '17.0.2',
        'react-dom': '17.0.2',
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

describe('experimental.nextScriptWorkers: true with required Partytown dependency', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      nextConfig: {
        experimental: {
          nextScriptWorkers: true,
        },
        dependencies: {
          react: '17',
          'react-dom': '17',
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

      const predefinedWorkerScripts = await browser.eval(
        `document.querySelectorAll('script[type="text/partytown"]').length`
      )

      expect(predefinedWorkerScripts).toBeGreaterThan(0)

      await waitFor(1000)

      // Partytown modifes type to "text/partytown-x" after it has been executed in the web worker
      const processedWorkerScripts = await browser.eval(
        `document.querySelectorAll('script[type="text/partytown-x"]').length`
      )

      expect(processedWorkerScripts).toBeGreaterThan(0)
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
        react: '17',
        'react-dom': '17',
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
