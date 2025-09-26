/* eslint-env jest */

import fs from 'fs/promises'
import { join } from 'path'
import webdriver from 'next-webdriver'
import {
  assertNoRedbox,
  findPort,
  killApp,
  launchApp,
  retry,
} from 'next-test-utils'
import stripAnsi from 'strip-ansi'

const appDir = join(__dirname, '../')
const gspPage = join(appDir, 'pages/gsp.js')
const gsspPage = join(appDir, 'pages/gssp.js')
const dynamicGsspPage = join(appDir, 'pages/blog/[slug].js')
const apiPage = join(appDir, 'pages/api/hello.js')
const dynamicApiPage = join(appDir, 'pages/api/blog/[slug].js')

let stderr = ''
let appPort
let app

const isTurbopack = process.env.IS_TURBOPACK_TEST

describe('server-side dev errors', () => {
  beforeAll(async () => {
    appPort = await findPort()
    app = await launchApp(appDir, appPort, {
      onStderr(msg) {
        stderr += msg
        // All tests cause Runtime ReferenceErrors which may lead to this message which
        // is not relevant to this test.
        stderr = stderr.replace(
          ' ⚠ Fast Refresh had to perform a full reload due to a Runtime ReferenceError.',
          ''
        )
      },
    })
  })
  afterAll(() => killApp(app))

  // TODO: update to ensure this frame is ignored properly by default
  function stripInternalHandler(output) {
    return output
      .replace(/.*at async handler .*next-route-loader.*/, '')
      .replace(/.*at async handleResponse.*/, '')
      .replace(/.*at async doRender \(.*/, '')
      .split(/\n/)
      .filter((item) => !!item.trim())
      .join('\n')
  }

  it('should show server-side error for gsp page correctly', async () => {
    const content = await fs.readFile(gspPage, 'utf8')

    try {
      const stderrIdx = stderr.length
      await fs.writeFile(
        gspPage,
        content.replace('return {', 'missingVar;return {')
      )
      const browser = await webdriver(appPort, '/gsp')

      await retry(() => {
        expect(stderr.slice(stderrIdx)).toContain(
          'ReferenceError: missingVar is not defined'
        )
      })

      const stderrOutput = stripInternalHandler(
        stripAnsi(stderr.slice(stderrIdx)).trim()
      )

      expect(stderrOutput).toStartWith(
        '⨯ ReferenceError: missingVar is not defined' +
          '\n    at getStaticProps (../../test/integration/server-side-dev-errors/pages/gsp.js:6:3)' +
          '\n  4 |' +
          '\n  5 | export async function getStaticProps() {' +
          '\n> 6 |   missingVar;return {' +
          '\n    |   ^'
      )

      await expect(browser).toDisplayRedbox(`
        {
          "description": "missingVar is not defined",
          "environmentLabel": null,
          "label": "Runtime ReferenceError",
          "source": "pages/gsp.js (6:3) @ getStaticProps
        > 6 |   missingVar;return {
            |   ^",
          "stack": [
            "getStaticProps pages/gsp.js (6:3)",
          ],
        }
      `)

      await fs.writeFile(gspPage, content, { flush: true })
      await assertNoRedbox(browser)
    } finally {
      await fs.writeFile(gspPage, content)
    }
  })

  it('should show server-side error for gssp page correctly', async () => {
    const content = await fs.readFile(gsspPage, 'utf8')

    try {
      const stderrIdx = stderr.length
      await fs.writeFile(
        gsspPage,
        content.replace('return {', 'missingVar;return {')
      )
      const browser = await webdriver(appPort, '/gssp')

      await retry(() => {
        expect(stderr.slice(stderrIdx)).toContain(
          'ReferenceError: missingVar is not defined'
        )
      })

      const stderrOutput = stripInternalHandler(
        stripAnsi(stderr.slice(stderrIdx)).trim()
      )
      expect(stderrOutput).toStartWith(
        '⨯ ReferenceError: missingVar is not defined' +
          '\n    at getServerSideProps (../../test/integration/server-side-dev-errors/pages/gssp.js:6:3)' +
          '\n  4 |' +
          '\n  5 | export async function getServerSideProps() {' +
          '\n> 6 |   missingVar;return {' +
          '\n    |   ^'
      )

      await expect(browser).toDisplayRedbox(`
        {
          "description": "missingVar is not defined",
          "environmentLabel": null,
          "label": "Runtime ReferenceError",
          "source": "pages/gssp.js (6:3) @ getServerSideProps
        > 6 |   missingVar;return {
            |   ^",
          "stack": [
            "getServerSideProps pages/gssp.js (6:3)",
          ],
        }
      `)

      await fs.writeFile(gsspPage, content)
      await assertNoRedbox(browser)
    } finally {
      await fs.writeFile(gsspPage, content)
    }
  })

  it('should show server-side error for dynamic gssp page correctly', async () => {
    const content = await fs.readFile(dynamicGsspPage, 'utf8')

    try {
      const stderrIdx = stderr.length
      await fs.writeFile(
        dynamicGsspPage,
        content.replace('return {', 'missingVar;return {')
      )
      const browser = await webdriver(appPort, '/blog/first')

      await retry(() => {
        expect(stderr.slice(stderrIdx)).toContain(
          'ReferenceError: missingVar is not defined'
        )
      })

      const stderrOutput = stripInternalHandler(
        stripAnsi(stderr.slice(stderrIdx)).trim()
      )
      expect(stderrOutput).toStartWith(
        '⨯ ReferenceError: missingVar is not defined' +
          '\n    at getServerSideProps (../../test/integration/server-side-dev-errors/pages/blog/[slug].js:6:3)' +
          '\n  4 |' +
          '\n  5 | export async function getServerSideProps() {' +
          '\n> 6 |   missingVar;return {' +
          '\n    |   ^'
      )

      await expect(browser).toDisplayRedbox(`
        {
          "description": "missingVar is not defined",
          "environmentLabel": null,
          "label": "Runtime ReferenceError",
          "source": "pages/blog/[slug].js (6:3) @ getServerSideProps
        > 6 |   missingVar;return {
            |   ^",
          "stack": [
            "getServerSideProps pages/blog/[slug].js (6:3)",
          ],
        }
      `)

      await fs.writeFile(dynamicGsspPage, content)
    } finally {
      await fs.writeFile(dynamicGsspPage, content)
    }
  })

  it('should show server-side error for api route correctly', async () => {
    const content = await fs.readFile(apiPage, 'utf8')

    try {
      const stderrIdx = stderr.length
      await fs.writeFile(
        apiPage,
        content.replace('res.status', 'missingVar;res.status')
      )
      const browser = await webdriver(appPort, '/api/hello')

      await retry(() => {
        expect(stderr.slice(stderrIdx)).toContain(
          'ReferenceError: missingVar is not defined'
        )
      })

      const stderrOutput = stripAnsi(stderr.slice(stderrIdx)).trim()
      if (isTurbopack) {
        expect(stderrOutput).toStartWith(
          '⨯ ReferenceError: missingVar is not defined' +
            '\n    at handler (../../test/integration/server-side-dev-errors/pages/api/hello.js:2:3)' +
            '\n  1 | export default function handler(req, res) {' +
            "\n> 2 |   missingVar;res.status(200).json({ hello: 'world' })" +
            '\n    |   ^'
        )
      } else {
        expect(stderrOutput).toStartWith(
          '⨯ ReferenceError: missingVar is not defined' +
            '\n    at handler (../../test/integration/server-side-dev-errors/pages/api/hello.js:2:3)' +
            // TODO(veil): Why not ignore-listed?
            '\n    at '
        )
        expect(stderrOutput).toContain(
          '\n  1 | export default function handler(req, res) {' +
            "\n> 2 |   missingVar;res.status(200).json({ hello: 'world' })" +
            '\n    |   ^'
        )
      }

      await expect(browser).toDisplayRedbox(`
        {
          "description": "missingVar is not defined",
          "environmentLabel": null,
          "label": "Runtime ReferenceError",
          "source": "pages/api/hello.js (2:3) @ handler
        > 2 |   missingVar;res.status(200).json({ hello: 'world' })
            |   ^",
          "stack": [
            "handler pages/api/hello.js (2:3)",
          ],
        }
      `)

      await fs.writeFile(apiPage, content, { flush: true })

      await retry(async () => {
        // manually refresh as this is an API route
        await browser.refresh()
        await assertNoRedbox(browser)
      })
    } finally {
      await fs.writeFile(apiPage, content)
    }
  })

  it('should show server-side error for dynamic api route correctly', async () => {
    const content = await fs.readFile(dynamicApiPage, 'utf8')

    try {
      const stderrIdx = stderr.length
      await fs.writeFile(
        dynamicApiPage,
        content.replace('res.status', 'missingVar;res.status')
      )
      const browser = await webdriver(appPort, '/api/blog/first')

      await retry(() => {
        expect(stderr.slice(stderrIdx)).toContain(
          'ReferenceError: missingVar is not defined'
        )
      })

      const stderrOutput = stripAnsi(stderr.slice(stderrIdx)).trim()
      if (isTurbopack) {
        expect(stderrOutput).toStartWith(
          '⨯ ReferenceError: missingVar is not defined' +
            '\n    at handler (../../test/integration/server-side-dev-errors/pages/api/blog/[slug].js:2:3)' +
            '\n  1 | export default function handler(req, res) {' +
            '\n> 2 |   missingVar;res.status(200).json({ slug: req.query.slug })' +
            '\n    |   ^'
        )
      } else {
        expect(stderrOutput).toStartWith(
          '⨯ ReferenceError: missingVar is not defined' +
            '\n    at handler (../../test/integration/server-side-dev-errors/pages/api/blog/[slug].js:2:3)' +
            // TODO(veil): Why not ignore-listed?
            '\n    at'
        )
        expect(stderrOutput).toContain(
          '\n  1 | export default function handler(req, res) {' +
            '\n> 2 |   missingVar;res.status(200).json({ slug: req.query.slug })' +
            '\n    |   ^'
        )
      }

      await expect(browser).toDisplayRedbox(`
        {
          "description": "missingVar is not defined",
          "environmentLabel": null,
          "label": "Runtime ReferenceError",
          "source": "pages/api/blog/[slug].js (2:3) @ handler
        > 2 |   missingVar;res.status(200).json({ slug: req.query.slug })
            |   ^",
          "stack": [
            "handler pages/api/blog/[slug].js (2:3)",
          ],
        }
      `)

      await fs.writeFile(dynamicApiPage, content, { flush: true })

      await retry(async () => {
        // manually refresh as this is an API route
        await browser.refresh()
        await assertNoRedbox(browser)
      })
    } finally {
      await fs.writeFile(dynamicApiPage, content)
    }
  })

  it('should show server-side error for uncaught rejection correctly', async () => {
    const stderrIdx = stderr.length
    await webdriver(appPort, '/uncaught-rejection')

    await retry(() => {
      expect(stderr.slice(stderrIdx)).toContain('Error: catch this rejection')
    })

    const stderrOutput = stripAnsi(stderr.slice(stderrIdx))
      .replace(
        '⚠ Fast Refresh had to perform a full reload due to a Runtime ReferenceError.',
        ''
      )
      .trim()
    // FIXME(veil): error repeated
    if (isTurbopack) {
      // Turbopack produces incorrect mappings in the sourcemap.
      expect(stderrOutput).toMatchInlineSnapshot(`
       "Error: catch this rejection
           at Timeout._onTimeout (../../test/integration/server-side-dev-errors/pages/uncaught-rejection.js:7:20)
          5 | export async function getServerSideProps() {
          6 |   setTimeout(() => {
       >  7 |     Promise.reject(new Error('catch this rejection'))
            |                    ^
          8 |   }, 10)
          9 |   return {
         10 |     props: {},
        ⨯ unhandledRejection: Error: catch this rejection
           at Timeout._onTimeout (../../test/integration/server-side-dev-errors/pages/uncaught-rejection.js:7:20)
          5 | export async function getServerSideProps() {
          6 |   setTimeout(() => {
       >  7 |     Promise.reject(new Error('catch this rejection'))
            |                    ^
          8 |   }, 10)
          9 |   return {
         10 |     props: {},
        ⨯ unhandledRejection:  Error: catch this rejection
           at Timeout._onTimeout (../../test/integration/server-side-dev-errors/pages/uncaught-rejection.js:7:20)
          5 | export async function getServerSideProps() {
          6 |   setTimeout(() => {
       >  7 |     Promise.reject(new Error('catch this rejection'))
            |                    ^
          8 |   }, 10)
          9 |   return {
         10 |     props: {},"
      `)
    } else {
      // sometimes there is a leading newline, so trim it
      expect(stderrOutput.trimStart()).toMatchInlineSnapshot(`
        "Error: catch this rejection
            at Timeout.eval [as _onTimeout] (../../test/integration/server-side-dev-errors/pages/uncaught-rejection.js:7:20)
           5 | export async function getServerSideProps() {
           6 |   setTimeout(() => {
        >  7 |     Promise.reject(new Error('catch this rejection'))
             |                    ^
           8 |   }, 10)
           9 |   return {
          10 |     props: {},
         ⨯ unhandledRejection: Error: catch this rejection
            at Timeout.eval [as _onTimeout] (../../test/integration/server-side-dev-errors/pages/uncaught-rejection.js:7:20)
           5 | export async function getServerSideProps() {
           6 |   setTimeout(() => {
        >  7 |     Promise.reject(new Error('catch this rejection'))
             |                    ^
           8 |   }, 10)
           9 |   return {
          10 |     props: {},
         ⨯ unhandledRejection:  Error: catch this rejection
            at Timeout.eval [as _onTimeout] (../../test/integration/server-side-dev-errors/pages/uncaught-rejection.js:7:20)
           5 | export async function getServerSideProps() {
           6 |   setTimeout(() => {
        >  7 |     Promise.reject(new Error('catch this rejection'))
             |                    ^
           8 |   }, 10)
           9 |   return {
          10 |     props: {},"
      `)
    }
  })

  it('should show server-side error for uncaught empty rejection correctly', async () => {
    const stderrIdx = stderr.length
    await webdriver(appPort, '/uncaught-empty-rejection')

    await retry(() => {
      expect(stderr.slice(stderrIdx)).toContain('Error:')
    })

    const stderrOutput = stripAnsi(stderr.slice(stderrIdx))
      .replace(
        '⚠ Fast Refresh had to perform a full reload due to a Runtime ReferenceError.',
        ''
      )
      .trim()
    // FIXME(veil): error repeated
    if (isTurbopack) {
      expect(stderrOutput).toMatchInlineSnapshot(`
       "Error: 
           at Timeout._onTimeout (../../test/integration/server-side-dev-errors/pages/uncaught-empty-rejection.js:7:20)
          5 | export async function getServerSideProps() {
          6 |   setTimeout(() => {
       >  7 |     Promise.reject(new Error())
            |                    ^
          8 |   }, 10)
          9 |   return {
         10 |     props: {},
        ⨯ unhandledRejection: Error: 
           at Timeout._onTimeout (../../test/integration/server-side-dev-errors/pages/uncaught-empty-rejection.js:7:20)
          5 | export async function getServerSideProps() {
          6 |   setTimeout(() => {
       >  7 |     Promise.reject(new Error())
            |                    ^
          8 |   }, 10)
          9 |   return {
         10 |     props: {},
        ⨯ unhandledRejection:  Error: 
           at Timeout._onTimeout (../../test/integration/server-side-dev-errors/pages/uncaught-empty-rejection.js:7:20)
          5 | export async function getServerSideProps() {
          6 |   setTimeout(() => {
       >  7 |     Promise.reject(new Error())
            |                    ^
          8 |   }, 10)
          9 |   return {
         10 |     props: {},"
      `)
    } else {
      expect(stderrOutput).toMatchInlineSnapshot(`
       "Error: 
           at Timeout.eval [as _onTimeout] (../../test/integration/server-side-dev-errors/pages/uncaught-empty-rejection.js:7:20)
          5 | export async function getServerSideProps() {
          6 |   setTimeout(() => {
       >  7 |     Promise.reject(new Error())
            |                    ^
          8 |   }, 10)
          9 |   return {
         10 |     props: {},
        ⨯ unhandledRejection: Error: 
           at Timeout.eval [as _onTimeout] (../../test/integration/server-side-dev-errors/pages/uncaught-empty-rejection.js:7:20)
          5 | export async function getServerSideProps() {
          6 |   setTimeout(() => {
       >  7 |     Promise.reject(new Error())
            |                    ^
          8 |   }, 10)
          9 |   return {
         10 |     props: {},
        ⨯ unhandledRejection:  Error: 
           at Timeout.eval [as _onTimeout] (../../test/integration/server-side-dev-errors/pages/uncaught-empty-rejection.js:7:20)
          5 | export async function getServerSideProps() {
          6 |   setTimeout(() => {
       >  7 |     Promise.reject(new Error())
            |                    ^
          8 |   }, 10)
          9 |   return {
         10 |     props: {},"
      `)
    }
  })

  it('should show server-side error for uncaught exception correctly', async () => {
    const stderrIdx = stderr.length
    await webdriver(appPort, '/uncaught-exception')

    await retry(() => {
      expect(stderr.slice(stderrIdx)).toContain('Error:')
    })

    const stderrOutput = stripAnsi(stderr.slice(stderrIdx))
      .replace(
        '⚠ Fast Refresh had to perform a full reload due to a Runtime ReferenceError.',
        ''
      )
      .trim()
    // FIXME(veil): error repeated
    if (isTurbopack) {
      expect(stderrOutput).toMatchInlineSnapshot(`
       "Error: catch this exception
           at Timeout._onTimeout (../../test/integration/server-side-dev-errors/pages/uncaught-exception.js:7:11)
          5 | export async function getServerSideProps() {
          6 |   setTimeout(() => {
       >  7 |     throw new Error('catch this exception')
            |           ^
          8 |   }, 10)
          9 |   return {
         10 |     props: {},
        ⨯ uncaughtException: Error: catch this exception
           at Timeout._onTimeout (../../test/integration/server-side-dev-errors/pages/uncaught-exception.js:7:11)
          5 | export async function getServerSideProps() {
          6 |   setTimeout(() => {
       >  7 |     throw new Error('catch this exception')
            |           ^
          8 |   }, 10)
          9 |   return {
         10 |     props: {},
        ⨯ uncaughtException:  Error: catch this exception
           at Timeout._onTimeout (../../test/integration/server-side-dev-errors/pages/uncaught-exception.js:7:11)
          5 | export async function getServerSideProps() {
          6 |   setTimeout(() => {
       >  7 |     throw new Error('catch this exception')
            |           ^
          8 |   }, 10)
          9 |   return {
         10 |     props: {},"
      `)
    } else {
      expect(stderrOutput).toMatchInlineSnapshot(`
       "Error: catch this exception
           at Timeout.eval [as _onTimeout] (../../test/integration/server-side-dev-errors/pages/uncaught-exception.js:7:11)
          5 | export async function getServerSideProps() {
          6 |   setTimeout(() => {
       >  7 |     throw new Error('catch this exception')
            |           ^
          8 |   }, 10)
          9 |   return {
         10 |     props: {},
        ⨯ uncaughtException: Error: catch this exception
           at Timeout.eval [as _onTimeout] (../../test/integration/server-side-dev-errors/pages/uncaught-exception.js:7:11)
          5 | export async function getServerSideProps() {
          6 |   setTimeout(() => {
       >  7 |     throw new Error('catch this exception')
            |           ^
          8 |   }, 10)
          9 |   return {
         10 |     props: {},
        ⨯ uncaughtException:  Error: catch this exception
           at Timeout.eval [as _onTimeout] (../../test/integration/server-side-dev-errors/pages/uncaught-exception.js:7:11)
          5 | export async function getServerSideProps() {
          6 |   setTimeout(() => {
       >  7 |     throw new Error('catch this exception')
            |           ^
          8 |   }, 10)
          9 |   return {
         10 |     props: {},"
      `)
    }
  })

  it('should show server-side error for uncaught empty exception correctly', async () => {
    const stderrIdx = stderr.length
    await webdriver(appPort, '/uncaught-empty-exception')

    await retry(() => {
      expect(stderr.slice(stderrIdx)).toContain('Error:')
    })

    const stderrOutput = stripAnsi(stderr.slice(stderrIdx))
      .replace(
        '⚠ Fast Refresh had to perform a full reload due to a Runtime ReferenceError.',
        ''
      )
      .trim()
    // FIXME(veil): error repeated
    if (isTurbopack) {
      expect(stderrOutput).toMatchInlineSnapshot(`
       "Error: 
           at Timeout._onTimeout (../../test/integration/server-side-dev-errors/pages/uncaught-empty-exception.js:7:11)
          5 | export async function getServerSideProps() {
          6 |   setTimeout(() => {
       >  7 |     throw new Error()
            |           ^
          8 |   }, 10)
          9 |   return {
         10 |     props: {},
        ⨯ uncaughtException: Error: 
           at Timeout._onTimeout (../../test/integration/server-side-dev-errors/pages/uncaught-empty-exception.js:7:11)
          5 | export async function getServerSideProps() {
          6 |   setTimeout(() => {
       >  7 |     throw new Error()
            |           ^
          8 |   }, 10)
          9 |   return {
         10 |     props: {},
        ⨯ uncaughtException:  Error: 
           at Timeout._onTimeout (../../test/integration/server-side-dev-errors/pages/uncaught-empty-exception.js:7:11)
          5 | export async function getServerSideProps() {
          6 |   setTimeout(() => {
       >  7 |     throw new Error()
            |           ^
          8 |   }, 10)
          9 |   return {
         10 |     props: {},"
      `)
    } else {
      expect(stderrOutput).toMatchInlineSnapshot(`
       "Error: 
           at Timeout.eval [as _onTimeout] (../../test/integration/server-side-dev-errors/pages/uncaught-empty-exception.js:7:11)
          5 | export async function getServerSideProps() {
          6 |   setTimeout(() => {
       >  7 |     throw new Error()
            |           ^
          8 |   }, 10)
          9 |   return {
         10 |     props: {},
        ⨯ uncaughtException: Error: 
           at Timeout.eval [as _onTimeout] (../../test/integration/server-side-dev-errors/pages/uncaught-empty-exception.js:7:11)
          5 | export async function getServerSideProps() {
          6 |   setTimeout(() => {
       >  7 |     throw new Error()
            |           ^
          8 |   }, 10)
          9 |   return {
         10 |     props: {},
        ⨯ uncaughtException:  Error: 
           at Timeout.eval [as _onTimeout] (../../test/integration/server-side-dev-errors/pages/uncaught-empty-exception.js:7:11)
          5 | export async function getServerSideProps() {
          6 |   setTimeout(() => {
       >  7 |     throw new Error()
            |           ^
          8 |   }, 10)
          9 |   return {
         10 |     props: {},"
      `)
    }
  })
})
