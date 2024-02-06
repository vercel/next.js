/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import webdriver from 'next-webdriver'
import {
  killApp,
  findPort,
  launchApp,
  check,
  hasRedbox,
  getRedboxSource,
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

describe('server-side dev errors', () => {
  beforeAll(async () => {
    appPort = await findPort()
    app = await launchApp(appDir, appPort, {
      onStderr(msg) {
        stderr += msg
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

      await check(async () => {
        const err = stderr.slice(stderrIdx)

        return err.includes('pages/gsp.js') &&
          err.includes('6:2') &&
          err.includes('getStaticProps') &&
          err.includes('missingVar')
          ? 'success'
          : err
      }, 'success')

      expect(await hasRedbox(browser)).toBe(true)

      expect(await getRedboxSource(browser)).toContain('missingVar')
      await fs.writeFile(gspPage, content)
      await hasRedbox(browser)
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

      await check(async () => {
        const err = stderr.slice(stderrIdx)

        return err.includes('pages/gssp.js') &&
          err.includes('6:2') &&
          err.includes('getServerSideProps') &&
          err.includes('missingVar')
          ? 'success'
          : err
      }, 'success')

      expect(await hasRedbox(browser)).toBe(true)

      expect(await getRedboxSource(browser)).toContain('missingVar')
      await fs.writeFile(gsspPage, content)
      await hasRedbox(browser)
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

      await check(async () => {
        const err = stderr.slice(stderrIdx)

        return err.includes('pages/blog/[slug].js') &&
          err.includes('6:2') &&
          err.includes('getServerSideProps') &&
          err.includes('missingVar')
          ? 'success'
          : err
      }, 'success')

      expect(await hasRedbox(browser)).toBe(true)

      expect(await getRedboxSource(browser)).toContain('missingVar')
      await fs.writeFile(dynamicGsspPage, content)
      await hasRedbox(browser)
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

      await check(async () => {
        const err = stderr.slice(stderrIdx)

        return err.includes('pages/api/hello.js') &&
          err.includes('2:2') &&
          err.includes('default') &&
          err.includes('missingVar')
          ? 'success'
          : err
      }, 'success')

      expect(await hasRedbox(browser)).toBe(true)

      expect(await getRedboxSource(browser)).toContain('missingVar')
      await fs.writeFile(apiPage, content)
      await hasRedbox(browser)
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

      await check(async () => {
        const err = stderr.slice(stderrIdx)

        return err.includes('pages/api/blog/[slug].js') &&
          err.includes('2:2') &&
          err.includes('default') &&
          err.includes('missingVar')
          ? 'success'
          : err
      }, 'success')

      expect(await hasRedbox(browser)).toBe(true)

      expect(await getRedboxSource(browser)).toContain('missingVar')
      await fs.writeFile(dynamicApiPage, content)
      await hasRedbox(browser)
    } finally {
      await fs.writeFile(dynamicApiPage, content)
    }
  })

  it('should show server-side error for uncaught rejection correctly', async () => {
    const stderrIdx = stderr.length
    await webdriver(appPort, '/uncaught-rejection')

    await check(async () => {
      const err = stderr.slice(stderrIdx)

      return err.includes('pages/uncaught-rejection.js') &&
        (err.includes('7:19') || err.includes('7:5')) &&
        err.includes('getServerSideProps') &&
        err.includes('catch this rejection')
        ? 'success'
        : err
    }, 'success')
  })

  it('should show server-side error for uncaught empty rejection correctly', async () => {
    const stderrIdx = stderr.length
    await webdriver(appPort, '/uncaught-empty-rejection')

    await check(async () => {
      const cleanStderr = stripAnsi(stderr.slice(stderrIdx))

      return cleanStderr.includes('pages/uncaught-empty-rejection.js') &&
        (cleanStderr.includes('7:19') || cleanStderr.includes('7:5')) &&
        cleanStderr.includes('getServerSideProps') &&
        cleanStderr.includes('new Error()')
        ? 'success'
        : cleanStderr
    }, 'success')
  })

  it('should show server-side error for uncaught exception correctly', async () => {
    const stderrIdx = stderr.length
    await webdriver(appPort, '/uncaught-exception')

    await check(async () => {
      const err = stderr.slice(stderrIdx)

      return err.includes('pages/uncaught-exception.js') &&
        (err.includes('7:10') || err.includes('7:5')) &&
        err.includes('getServerSideProps') &&
        err.includes('catch this exception')
        ? 'success'
        : err
    }, 'success')
  })

  it('should show server-side error for uncaught empty exception correctly', async () => {
    const stderrIdx = stderr.length
    await webdriver(appPort, '/uncaught-empty-exception')

    await check(async () => {
      const cleanStderr = stripAnsi(stderr.slice(stderrIdx))

      return cleanStderr.includes('pages/uncaught-empty-exception.js') &&
        (cleanStderr.includes('7:10') || cleanStderr.includes('7:5')) &&
        cleanStderr.includes('getServerSideProps') &&
        cleanStderr.includes('new Error()')
        ? 'success'
        : cleanStderr
    }, 'success')
  })
})
