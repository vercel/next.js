/* eslint-env jest */

import fs from 'fs/promises'
import { join } from 'path'
import webdriver from 'next-webdriver'
import {
  assertHasRedbox,
  killApp,
  findPort,
  launchApp,
  retry,
  getRedboxSource,
  assertNoRedbox,
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

const isTurbopack = process.env.TURBOPACK

describe('server-side dev errors', () => {
  beforeAll(async () => {
    appPort = await findPort()
    app = await launchApp(appDir, appPort, {
      onStderr(msg) {
        stderr += msg
        // All tests cause runtime errors which may lead to this message which
        // is not relevant to this test.
        stderr = stderr.replace(
          ' ⚠ Fast Refresh had to perform a full reload due to a runtime error.',
          ''
        )
      },
      env: {
        __NEXT_TEST_WITH_DEVTOOL: 1,
      },
    })
  })
  afterAll(() => killApp(app))

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

      const stderrOutput = stripAnsi(stderr.slice(stderrIdx))
      if (isTurbopack) {
        // FIXME(veil): Paths include root twice. Bug in generated Turbopack sourcemaps.
        expect(stderrOutput).toStartWith(
          ' ⨯ ../../test/integration/server-side-dev-errors/test/integration/server-side-dev-errors/pages/gsp.js (6:3) @ getStaticProps' +
            '\n ⨯ ../../test/integration/server-side-dev-errors/test/integration/server-side-dev-errors/pages/gsp.js (6:3) @ getStaticProps'
        )
        expect(stderrOutput).toContain(
          ' ⨯ ReferenceError: missingVar is not defined' +
            '\n    at getStaticProps (./test/integration/server-side-dev-errors/pages/gsp.js:6:3)' +
            // TODO(veil): Should be sourcemapped
            '\n    at'
        )
      } else {
        expect(stderr).toStartWith(
          ' ⨯ pages/gsp.js (6:3) @ missingVar' +
            '\n ⨯ ReferenceError: missingVar is not defined' +
            '\n    at getStaticProps (./pages/gsp.js:19:5)' +
            // TODO(veil): Should be sourcemapped
            '\n    at'
        )
      }
      expect(stderr).toContain(
        '\n  5 | export async function getStaticProps() {' +
          '\n> 6 |   missingVar;return {'
      )

      await assertHasRedbox(browser)

      expect(await getRedboxSource(browser)).toContain('missingVar')
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

      const stderrOutput = stripAnsi(stderr.slice(stderrIdx))
      if (isTurbopack) {
        // FIXME(veil): Paths include root twice. Bug in generated Turbopack sourcemaps.
        expect(stderrOutput).toStartWith(
          ' ⨯ ../../test/integration/server-side-dev-errors/test/integration/server-side-dev-errors/pages/gssp.js (6:3) @ getServerSideProps' +
            '\n ⨯ ../../test/integration/server-side-dev-errors/test/integration/server-side-dev-errors/pages/gssp.js (6:3) @ getServerSideProps'
        )
        expect(stderrOutput).toContain(
          ' ⨯ ReferenceError: missingVar is not defined' +
            '\n    at getServerSideProps (./test/integration/server-side-dev-errors/pages/gssp.js:6:3)' +
            // TODO(veil): Should be sourcemapped
            '\n    at'
        )
      } else {
        expect(stderrOutput).toStartWith(
          ' ⨯ pages/gssp.js (6:3) @ missingVar' +
            '\n ⨯ ReferenceError: missingVar is not defined' +
            '\n    at getServerSideProps (./pages/gssp.js:19:5)' +
            // TODO(veil): Should be sourcemapped
            '\n    at'
        )
      }
      expect(stderrOutput).toContain(
        '\n  5 | export async function getServerSideProps() {' +
          '\n> 6 |   missingVar;return {'
      )

      await assertHasRedbox(browser)

      expect(await getRedboxSource(browser)).toContain('missingVar')
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

      const stderrOutput = stripAnsi(stderr.slice(stderrIdx))
      if (isTurbopack) {
        // FIXME(veil): Paths include root twice. Bug in generated Turbopack sourcemaps.
        expect(stderrOutput).toStartWith(
          ' ⨯ ../../test/integration/server-side-dev-errors/test/integration/server-side-dev-errors/pages/blog/[slug].js (6:3) @ getServerSideProps' +
            '\n ⨯ ../../test/integration/server-side-dev-errors/test/integration/server-side-dev-errors/pages/blog/[slug].js (6:3) @ getServerSideProps'
        )
        expect(stderrOutput).toContain(
          ' ⨯ ReferenceError: missingVar is not defined' +
            '\n    at getServerSideProps (./test/integration/server-side-dev-errors/pages/blog/[slug].js:6:3)' +
            // TODO(veil): Should be sourcemapped
            '\n    at'
        )
      } else {
        expect(stderrOutput).toStartWith(
          ' ⨯ pages/blog/[slug].js (6:3) @ missingVar' +
            '\n ⨯ ReferenceError: missingVar is not defined' +
            '\n    at getServerSideProps (./pages/blog/[slug].js:19:5)' +
            // TODO(veil): Should be sourcemapped
            '\n    at'
        )
      }
      expect(stderrOutput).toContain(
        '\n  5 | export async function getServerSideProps() {' +
          '\n> 6 |   missingVar;return {'
      )

      await assertHasRedbox(browser)

      expect(await getRedboxSource(browser)).toContain('missingVar')
      await fs.writeFile(dynamicGsspPage, content)
      await assertHasRedbox(browser)
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

      const stderrOutput = stripAnsi(stderr.slice(stderrIdx))
      if (isTurbopack) {
        // FIXME(veil): Paths include root twice. Bug in generated Turbopack sourcemaps.
        expect(stderrOutput).toStartWith(
          ' ⨯ ../../test/integration/server-side-dev-errors/test/integration/server-side-dev-errors/pages/api/hello.js (2:3) @ handler' +
            '\n ⨯ ../../test/integration/server-side-dev-errors/test/integration/server-side-dev-errors/pages/api/hello.js (2:3) @ handler'
        )
        expect(stderrOutput).toContain(
          ' ⨯ ReferenceError: missingVar is not defined' +
            '\n    at handler (./test/integration/server-side-dev-errors/pages/api/hello.js:2:3)' +
            // TODO(veil): Should be sourcemapped
            '\n    at'
        )
      } else {
        expect(stderrOutput).toStartWith(
          ' ⨯ pages/api/hello.js (2:3) @ missingVar' +
            '\n ⨯ ReferenceError: missingVar is not defined' +
            '\n    at handler (./pages/api/hello.js:6:5)' +
            // TODO(veil): Should be sourcemapped
            '\n    at'
        )
      }
      expect(stderrOutput).toContain(
        '\n  1 | export default function handler(req, res) {' +
          "\n> 2 |   missingVar;res.status(200).json({ hello: 'world' })"
      )

      await assertHasRedbox(browser)

      expect(await getRedboxSource(browser)).toContain('missingVar')
      await fs.writeFile(apiPage, content)
      await assertHasRedbox(browser)
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

      const stderrOutput = stripAnsi(stderr.slice(stderrIdx))
      // FIXME(veil): error repeated
      // FIXME(veil): codeframe repeated after " ⨯ unhandledRejection: Error: catch this rejection"
      if (isTurbopack) {
        // FIXME(veil): Paths include root twice. Bug in generated Turbopack sourcemaps.
        expect(stderrOutput).toStartWith(
          ' ⨯ ../../test/integration/server-side-dev-errors/test/integration/server-side-dev-errors/pages/api/blog/[slug].js (2:3) @ handler' +
            '\n ⨯ ../../test/integration/server-side-dev-errors/test/integration/server-side-dev-errors/pages/api/blog/[slug].js (2:3) @ handler'
        )
        expect(stderrOutput).toContain(
          '\n ⨯ Error: missingVar is not defined' +
            '\n    at handler (./test/integration/server-side-dev-errors/pages/api/blog/[slug].js:2:3)' +
            // TODO(veil): Should be sourcemapped
            '\n    at'
        )
      } else {
        expect(stderrOutput).toStartWith(
          ' ⨯ pages/api/blog/[slug].js (2:3) @ missingVar' +
            '\n ⨯ ReferenceError: missingVar is not defined' +
            '\n    at handler (./pages/api/blog/[slug].js:6:5)' +
            // TODO(veil): Should be sourcemapped
            '\n    at'
        )
      }

      expect(stderrOutput).toContain(
        '\n  1 | export default function handler(req, res) {' +
          '\n> 2 |   missingVar;res.status(200).json({ slug: req.query.slug })'
      )

      await assertHasRedbox(browser)

      expect(await getRedboxSource(browser)).toContain('missingVar')
      await fs.writeFile(dynamicApiPage, content)
      await assertHasRedbox(browser)
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
    // FIXME(veil): error repeated
    // FIXME(veil): codeframe repeated after " ⨯ unhandledRejection: Error: catch this rejection"
    if (isTurbopack) {
      // TODO(veil): digest: undefined should be omitted?
      // FIXME(veil): Paths include root twice. Bug in generated Turbopack sourcemaps.
      expect(stderrOutput).toMatchInlineSnapshot(`
        "Error: catch this rejection
            at Timeout._onTimeout (../../test/integration/server-side-dev-errors/test/integration/server-side-dev-errors/pages/uncaught-rejection.js:7:19)
           5 | export async function getServerSideProps() {
           6 |   setTimeout(() => {
        >  7 |     Promise.reject(new Error('catch this rejection'))
             |                   ^
           8 |   }, 10)
           9 |   return {
          10 |     props: {},
         ⨯ ../../test/integration/server-side-dev-errors/test/integration/server-side-dev-errors/pages/uncaught-rejection.js (7:20) @ Timeout._onTimeout
         ⨯ ../../test/integration/server-side-dev-errors/test/integration/server-side-dev-errors/pages/uncaught-rejection.js (7:20) @ Timeout._onTimeout
         ⨯ unhandledRejection: Error: catch this rejection
            at Timeout._onTimeout (./test/integration/server-side-dev-errors/pages/uncaught-rejection.js:7:20) {
          digest: undefined
        }
           5 | export async function getServerSideProps() {
           6 |   setTimeout(() => {
        >  7 |     Promise.reject(new Error('catch this rejection'))
             |                    ^
           8 |   }, 10)
           9 |   return {
          10 |     props: {},
         ⨯ unhandledRejection: Error: catch this rejection
            at Timeout._onTimeout (./test/integration/server-side-dev-errors/pages/uncaught-rejection.js:7:20) {
          digest: undefined
        }
           5 | export async function getServerSideProps() {
           6 |   setTimeout(() => {
        >  7 |     Promise.reject(new Error('catch this rejection'))
             |                    ^
           8 |   }, 10)
           9 |   return {
          10 |     props: {},
        "
      `)
    } else {
      // sometimes there is a leading newline, so trim it
      expect(stderrOutput.trimStart()).toMatchInlineSnapshot(`
        "Error: catch this rejection
            at Timeout.eval [as _onTimeout] (../../test/integration/server-side-dev-errors/pages/uncaught-rejection.js:7:19)
           5 | export async function getServerSideProps() {
           6 |   setTimeout(() => {
        >  7 |     Promise.reject(new Error('catch this rejection'))
             |                   ^
           8 |   }, 10)
           9 |   return {
          10 |     props: {},
         ⨯ pages/uncaught-rejection.js (7:20) @ Timeout.eval [as _onTimeout]
         ⨯ unhandledRejection: Error: catch this rejection
            at Timeout.eval [as _onTimeout] (../../test/integration/server-side-dev-errors/pages/uncaught-rejection.js:7:19)
           5 | export async function getServerSideProps() {
           6 |   setTimeout(() => {
        >  7 |     Promise.reject(new Error('catch this rejection'))
             |                   ^
           8 |   }, 10)
           9 |   return {
          10 |     props: {},
           5 | export async function getServerSideProps() {
           6 |   setTimeout(() => {
        >  7 |     Promise.reject(new Error('catch this rejection'))
             |                    ^
           8 |   }, 10)
           9 |   return {
          10 |     props: {},
         ⨯ pages/uncaught-rejection.js (7:20) @ Timeout.eval [as _onTimeout]
         ⨯ unhandledRejection: Error: catch this rejection
            at Timeout.eval [as _onTimeout] (../../test/integration/server-side-dev-errors/pages/uncaught-rejection.js:7:19)
           5 | export async function getServerSideProps() {
           6 |   setTimeout(() => {
        >  7 |     Promise.reject(new Error('catch this rejection'))
             |                   ^
           8 |   }, 10)
           9 |   return {
          10 |     props: {},
           5 | export async function getServerSideProps() {
           6 |   setTimeout(() => {
        >  7 |     Promise.reject(new Error('catch this rejection'))
             |                    ^
           8 |   }, 10)
           9 |   return {
          10 |     props: {},
        "
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
    // FIXME(veil): error repeated
    // FIXME(veil): codeframe repeated after " ⨯ unhandledRejection: Error:"
    if (isTurbopack) {
      // TODO(veil): digest: undefined should be omitted?
      expect(stderrOutput).toMatchInlineSnapshot(`
        "Error: 
            at Timeout._onTimeout (../../test/integration/server-side-dev-errors/test/integration/server-side-dev-errors/pages/uncaught-empty-rejection.js:7:19)
           5 | export async function getServerSideProps() {
           6 |   setTimeout(() => {
        >  7 |     Promise.reject(new Error())
             |                   ^
           8 |   }, 10)
           9 |   return {
          10 |     props: {},
         ⨯ ../../test/integration/server-side-dev-errors/test/integration/server-side-dev-errors/pages/uncaught-empty-rejection.js (7:20) @ Timeout._onTimeout
         ⨯ ../../test/integration/server-side-dev-errors/test/integration/server-side-dev-errors/pages/uncaught-empty-rejection.js (7:20) @ Timeout._onTimeout
         ⨯ unhandledRejection: Error: 
            at Timeout._onTimeout (./test/integration/server-side-dev-errors/pages/uncaught-empty-rejection.js:7:20) {
          digest: undefined
        }
           5 | export async function getServerSideProps() {
           6 |   setTimeout(() => {
        >  7 |     Promise.reject(new Error())
             |                    ^
           8 |   }, 10)
           9 |   return {
          10 |     props: {},
         ⨯ unhandledRejection: Error: 
            at Timeout._onTimeout (./test/integration/server-side-dev-errors/pages/uncaught-empty-rejection.js:7:20) {
          digest: undefined
        }
           5 | export async function getServerSideProps() {
           6 |   setTimeout(() => {
        >  7 |     Promise.reject(new Error())
             |                    ^
           8 |   }, 10)
           9 |   return {
          10 |     props: {},
        "
      `)
    } else {
      expect(stderrOutput).toMatchInlineSnapshot(`
              "Error: 
                  at Timeout.eval [as _onTimeout] (../../test/integration/server-side-dev-errors/pages/uncaught-empty-rejection.js:7:19)
                 5 | export async function getServerSideProps() {
                 6 |   setTimeout(() => {
              >  7 |     Promise.reject(new Error())
                   |                   ^
                 8 |   }, 10)
                 9 |   return {
                10 |     props: {},
               ⨯ pages/uncaught-empty-rejection.js (7:20) @ Timeout.eval [as _onTimeout]
               ⨯ unhandledRejection: Error: 
                  at Timeout.eval [as _onTimeout] (../../test/integration/server-side-dev-errors/pages/uncaught-empty-rejection.js:7:19)
                 5 | export async function getServerSideProps() {
                 6 |   setTimeout(() => {
              >  7 |     Promise.reject(new Error())
                   |                   ^
                 8 |   }, 10)
                 9 |   return {
                10 |     props: {},
                 5 | export async function getServerSideProps() {
                 6 |   setTimeout(() => {
              >  7 |     Promise.reject(new Error())
                   |                    ^
                 8 |   }, 10)
                 9 |   return {
                10 |     props: {},
               ⨯ pages/uncaught-empty-rejection.js (7:20) @ Timeout.eval [as _onTimeout]
               ⨯ unhandledRejection: Error: 
                  at Timeout.eval [as _onTimeout] (../../test/integration/server-side-dev-errors/pages/uncaught-empty-rejection.js:7:19)
                 5 | export async function getServerSideProps() {
                 6 |   setTimeout(() => {
              >  7 |     Promise.reject(new Error())
                   |                   ^
                 8 |   }, 10)
                 9 |   return {
                10 |     props: {},
                 5 | export async function getServerSideProps() {
                 6 |   setTimeout(() => {
              >  7 |     Promise.reject(new Error())
                   |                    ^
                 8 |   }, 10)
                 9 |   return {
                10 |     props: {},
              "
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
    // FIXME(veil): error repeated
    // FIXME(veil): codeframe repeated after " ⨯ unhandledRejection: Error:"
    if (isTurbopack) {
      // TODO(veil): digest: undefined should be omitted?
      expect(stderrOutput).toMatchInlineSnapshot(`
        "Error: catch this exception
            at Timeout._onTimeout (../../test/integration/server-side-dev-errors/test/integration/server-side-dev-errors/pages/uncaught-exception.js:7:10)
           5 | export async function getServerSideProps() {
           6 |   setTimeout(() => {
        >  7 |     throw new Error('catch this exception')
             |          ^
           8 |   }, 10)
           9 |   return {
          10 |     props: {},
         ⨯ ../../test/integration/server-side-dev-errors/test/integration/server-side-dev-errors/pages/uncaught-exception.js (7:11) @ Timeout._onTimeout
         ⨯ ../../test/integration/server-side-dev-errors/test/integration/server-side-dev-errors/pages/uncaught-exception.js (7:11) @ Timeout._onTimeout
         ⨯ uncaughtException: Error: catch this exception
            at Timeout._onTimeout (./test/integration/server-side-dev-errors/pages/uncaught-exception.js:7:11) {
          digest: undefined
        }
           5 | export async function getServerSideProps() {
           6 |   setTimeout(() => {
        >  7 |     throw new Error('catch this exception')
             |           ^
           8 |   }, 10)
           9 |   return {
          10 |     props: {},
         ⨯ uncaughtException: Error: catch this exception
            at Timeout._onTimeout (./test/integration/server-side-dev-errors/pages/uncaught-exception.js:7:11) {
          digest: undefined
        }
           5 | export async function getServerSideProps() {
           6 |   setTimeout(() => {
        >  7 |     throw new Error('catch this exception')
             |           ^
           8 |   }, 10)
           9 |   return {
          10 |     props: {},
        "
      `)
    } else {
      expect(stderrOutput).toMatchInlineSnapshot(`
        "Error: catch this exception
            at Timeout.eval [as _onTimeout] (../../test/integration/server-side-dev-errors/pages/uncaught-exception.js:7:10)
           5 | export async function getServerSideProps() {
           6 |   setTimeout(() => {
        >  7 |     throw new Error('catch this exception')
             |          ^
           8 |   }, 10)
           9 |   return {
          10 |     props: {},
         ⨯ pages/uncaught-exception.js (7:11) @ Timeout.eval [as _onTimeout]
         ⨯ uncaughtException: Error: catch this exception
            at Timeout.eval [as _onTimeout] (../../test/integration/server-side-dev-errors/pages/uncaught-exception.js:7:10)
           5 | export async function getServerSideProps() {
           6 |   setTimeout(() => {
        >  7 |     throw new Error('catch this exception')
             |          ^
           8 |   }, 10)
           9 |   return {
          10 |     props: {},
           5 | export async function getServerSideProps() {
           6 |   setTimeout(() => {
        >  7 |     throw new Error('catch this exception')
             |           ^
           8 |   }, 10)
           9 |   return {
          10 |     props: {},
         ⨯ pages/uncaught-exception.js (7:11) @ Timeout.eval [as _onTimeout]
         ⨯ uncaughtException: Error: catch this exception
            at Timeout.eval [as _onTimeout] (../../test/integration/server-side-dev-errors/pages/uncaught-exception.js:7:10)
           5 | export async function getServerSideProps() {
           6 |   setTimeout(() => {
        >  7 |     throw new Error('catch this exception')
             |          ^
           8 |   }, 10)
           9 |   return {
          10 |     props: {},
           5 | export async function getServerSideProps() {
           6 |   setTimeout(() => {
        >  7 |     throw new Error('catch this exception')
             |           ^
           8 |   }, 10)
           9 |   return {
          10 |     props: {},
        "
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
    // FIXME(veil): error repeated
    // FIXME(veil): codeframe repeated after " ⨯ unhandledRejection: Error:"
    if (isTurbopack) {
      // TODO(veil): digest: undefined should be omitted?
      expect(stderrOutput).toMatchInlineSnapshot(`
        "Error: 
            at Timeout._onTimeout (../../test/integration/server-side-dev-errors/test/integration/server-side-dev-errors/pages/uncaught-empty-exception.js:7:10)
           5 | export async function getServerSideProps() {
           6 |   setTimeout(() => {
        >  7 |     throw new Error()
             |          ^
           8 |   }, 10)
           9 |   return {
          10 |     props: {},
         ⨯ ../../test/integration/server-side-dev-errors/test/integration/server-side-dev-errors/pages/uncaught-empty-exception.js (7:11) @ Timeout._onTimeout
         ⨯ ../../test/integration/server-side-dev-errors/test/integration/server-side-dev-errors/pages/uncaught-empty-exception.js (7:11) @ Timeout._onTimeout
         ⨯ uncaughtException: Error: 
            at Timeout._onTimeout (./test/integration/server-side-dev-errors/pages/uncaught-empty-exception.js:7:11) {
          digest: undefined
        }
           5 | export async function getServerSideProps() {
           6 |   setTimeout(() => {
        >  7 |     throw new Error()
             |           ^
           8 |   }, 10)
           9 |   return {
          10 |     props: {},
         ⨯ uncaughtException: Error: 
            at Timeout._onTimeout (./test/integration/server-side-dev-errors/pages/uncaught-empty-exception.js:7:11) {
          digest: undefined
        }
           5 | export async function getServerSideProps() {
           6 |   setTimeout(() => {
        >  7 |     throw new Error()
             |           ^
           8 |   }, 10)
           9 |   return {
          10 |     props: {},
        "
      `)
    } else {
      expect(stderrOutput).toMatchInlineSnapshot(`
              "Error: 
                  at Timeout.eval [as _onTimeout] (../../test/integration/server-side-dev-errors/pages/uncaught-empty-exception.js:7:10)
                 5 | export async function getServerSideProps() {
                 6 |   setTimeout(() => {
              >  7 |     throw new Error()
                   |          ^
                 8 |   }, 10)
                 9 |   return {
                10 |     props: {},
               ⨯ pages/uncaught-empty-exception.js (7:11) @ Timeout.eval [as _onTimeout]
               ⨯ uncaughtException: Error: 
                  at Timeout.eval [as _onTimeout] (../../test/integration/server-side-dev-errors/pages/uncaught-empty-exception.js:7:10)
                 5 | export async function getServerSideProps() {
                 6 |   setTimeout(() => {
              >  7 |     throw new Error()
                   |          ^
                 8 |   }, 10)
                 9 |   return {
                10 |     props: {},
                 5 | export async function getServerSideProps() {
                 6 |   setTimeout(() => {
              >  7 |     throw new Error()
                   |           ^
                 8 |   }, 10)
                 9 |   return {
                10 |     props: {},
               ⨯ pages/uncaught-empty-exception.js (7:11) @ Timeout.eval [as _onTimeout]
               ⨯ uncaughtException: Error: 
                  at Timeout.eval [as _onTimeout] (../../test/integration/server-side-dev-errors/pages/uncaught-empty-exception.js:7:10)
                 5 | export async function getServerSideProps() {
                 6 |   setTimeout(() => {
              >  7 |     throw new Error()
                   |          ^
                 8 |   }, 10)
                 9 |   return {
                10 |     props: {},
                 5 | export async function getServerSideProps() {
                 6 |   setTimeout(() => {
              >  7 |     throw new Error()
                   |           ^
                 8 |   }, 10)
                 9 |   return {
                10 |     props: {},
              "
          `)
    }
  })
})
