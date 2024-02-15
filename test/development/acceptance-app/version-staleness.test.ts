/* eslint-env jest */
import { sandbox } from 'development-sandbox'
import { FileRef, nextTestSetup } from 'e2e-utils'
import path from 'path'
import { outdent } from 'outdent'

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

    const { browser, session, cleanup } = await sandbox(
      next,
      new Map([
        ['node_modules/next/package.json', JSON.stringify(nextPackageJson)],
      ])
    )

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

    await session.waitForAndOpenRuntimeError()
    expect(
      await browser
        .waitForElementByCss('.nextjs-container-build-error-version-status')
        .text()
    ).toMatchInlineSnapshot(`"Next.js (1.0.0) is outdated (learn more)"`)

    await cleanup()
  })

  it('should show version staleness in render error', async () => {
    // Set next to outdated version
    const nextPackageJson = JSON.parse(
      await next.readFile('node_modules/next/package.json')
    )
    nextPackageJson.version = '2.0.0'

    const { browser, session, cleanup } = await sandbox(
      next,
      new Map([
        ['node_modules/next/package.json', JSON.stringify(nextPackageJson)],
      ])
    )

    await session.patch(
      'app/page.js',
      outdent`
        export default function Page() {
          throw new Error("render error")
          return null
        }
      `
    )

    expect(
      await browser
        .waitForElementByCss('.nextjs-container-build-error-version-status')
        .text()
    ).toMatchInlineSnapshot(`"Next.js (2.0.0) is outdated (learn more)"`)

    await cleanup()
  })

  it('should show version staleness in build error', async () => {
    // Set next to outdated version
    const nextPackageJson = JSON.parse(
      await next.readFile('node_modules/next/package.json')
    )
    nextPackageJson.version = '3.0.0'

    const { browser, session, cleanup } = await sandbox(
      next,
      new Map([
        ['node_modules/next/package.json', JSON.stringify(nextPackageJson)],
      ])
    )

    await session.patch(
      'app/page.js',
      outdent`
        {{{
      `
    )

    expect(
      await browser
        .waitForElementByCss('.nextjs-container-build-error-version-status')
        .text()
    ).toMatchInlineSnapshot(`"Next.js (3.0.0) is outdated (learn more)"`)

    await cleanup()
  })
})
