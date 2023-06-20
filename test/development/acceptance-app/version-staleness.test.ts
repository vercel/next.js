/* eslint-env jest */
import { sandbox } from './helpers'
import { createNextDescribe, FileRef } from 'e2e-utils'
import path from 'path'

describe.skip('should skip for now', () => {
  createNextDescribe(
    'Error Overlay version staleness',
    {
      files: new FileRef(path.join(__dirname, 'fixtures', 'default-template')),
      dependencies: {
        react: 'latest',
        'react-dom': 'latest',
      },
      skipStart: true,
    },
    ({ next }) => {
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
          `
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
          `
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
          `
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
    }
  )
})
