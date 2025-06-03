/* eslint-env jest */
import { createSandbox } from 'development-sandbox'
import { FileRef, nextTestSetup } from 'e2e-utils'
import path from 'path'
import { outdent } from 'outdent'
import { Playwright } from 'next-webdriver'

function getStaleness(browser: Playwright) {
  return browser
    .waitForElementByCss('.nextjs-container-build-error-version-status')
    .text()
}

describe('Error Overlay version staleness', () => {
  const { next } = nextTestSetup({
    files: new FileRef(path.join(__dirname, 'fixtures', 'default-template')),
    skipStart: true,
  })

  it('should show version staleness in runtime error', async () => {
    // Set next to outdated version
    const nextPackageJson = JSON.parse(
      await next.readFile('node_modules/next/package.json')
    )
    nextPackageJson.version = '1.0.0'

    await using sandbox = await createSandbox(
      next,
      new Map([
        ['node_modules/next/package.json', JSON.stringify(nextPackageJson)],
      ])
    )
    const { session, browser } = sandbox
    await session.patch(
      'app/page.js',
      outdent`
        "use client"
        import Component from '../index'
        export default function Page() {
          setTimeout(() => {
              throw new Error("runtime error")
          }, 0)
          return null
        }
      `
    )

    await session.openRedbox()

    if (process.env.IS_TURBOPACK_TEST) {
      expect(await getStaleness(browser)).toMatchInlineSnapshot(`
         "Next.js 1.0.0 (outdated)
         Turbopack"
        `)
    } else if (process.env.NEXT_RSPACK) {
      expect(await getStaleness(browser)).toMatchInlineSnapshot(`
         "Next.js 1.0.0 (outdated)
         Rspack"
        `)
    } else {
      expect(await getStaleness(browser)).toMatchInlineSnapshot(`
         "Next.js 1.0.0 (outdated)
         Webpack"
        `)
    }
  })

  it('should show version staleness in render error', async () => {
    // Set next to outdated version
    const nextPackageJson = JSON.parse(
      await next.readFile('node_modules/next/package.json')
    )
    nextPackageJson.version = '2.0.0'

    await using sandbox = await createSandbox(
      next,
      new Map([
        ['node_modules/next/package.json', JSON.stringify(nextPackageJson)],
      ])
    )
    const { session, browser } = sandbox
    await session.patch(
      'app/page.js',
      outdent`
        export default function Page() {
          throw new Error("render error")
          return null
        }
      `
    )

    if (process.env.IS_TURBOPACK_TEST) {
      expect(await getStaleness(browser)).toMatchInlineSnapshot(`
         "Next.js 2.0.0 (outdated)
         Turbopack"
        `)
    } else if (process.env.NEXT_RSPACK) {
      expect(await getStaleness(browser)).toMatchInlineSnapshot(`
         "Next.js 2.0.0 (outdated)
         Rspack"
        `)
    } else {
      expect(await getStaleness(browser)).toMatchInlineSnapshot(`
         "Next.js 2.0.0 (outdated)
         Webpack"
        `)
    }
  })

  it('should show version staleness in build error', async () => {
    // Set next to outdated version
    const nextPackageJson = JSON.parse(
      await next.readFile('node_modules/next/package.json')
    )
    nextPackageJson.version = '3.0.0'

    await using sandbox = await createSandbox(
      next,
      new Map([
        ['node_modules/next/package.json', JSON.stringify(nextPackageJson)],
      ])
    )
    const { session, browser } = sandbox
    await session.patch(
      'app/page.js',
      outdent`
        {{{
      `
    )

    if (process.env.IS_TURBOPACK_TEST) {
      expect(await getStaleness(browser)).toMatchInlineSnapshot(`
         "Next.js 3.0.0 (outdated)
         Turbopack"
        `)
    } else if (process.env.NEXT_RSPACK) {
      expect(await getStaleness(browser)).toMatchInlineSnapshot(`
         "Next.js 3.0.0 (outdated)
         Rspack"
        `)
    } else {
      expect(await getStaleness(browser)).toMatchInlineSnapshot(`
         "Next.js 3.0.0 (outdated)
         Webpack"
        `)
    }
  })
})
