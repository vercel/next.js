/* eslint-env jest */
import { sandbox } from './helpers'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import path from 'path'

describe('Error Overlay for server components', () => {
  if (process.env.NEXT_TEST_REACT_VERSION === '^17') {
    it('should skip for react v17', () => {})
    return
  }

  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: new FileRef(path.join(__dirname, 'fixtures', 'default-template')),
      dependencies: {
        react: 'latest',
        'react-dom': 'latest',
      },
      skipStart: true,
    })
  })
  afterAll(() => next.destroy())

  describe('createContext called in Server Component', () => {
    it('should show error when React.createContext is called', async () => {
      const { session, browser, cleanup } = await sandbox(
        next,
        new Map([
          [
            'app/page.js',
            `
        import React from 'react'
        const Context = React.createContext()
        export default function Page() {
          return (
            <>
                <Context.Provider value="hello">
                    <h1>Page</h1>
                </Context.Provider>
            </>
          )
        }`,
          ],
        ])
      )

      // TODO-APP: currently requires a full reload because moving from a client component to a server component isn't causing a Fast Refresh yet.
      await browser.refresh()

      expect(await session.hasRedbox(true)).toBe(true)
      expect(await session.getRedboxSource(true)).toMatchSnapshot()
      expect(next.cliOutput).toContain(
        'createContext only works in Client Components'
      )

      await cleanup()
    })

    it('should show error when React.createContext is called in external package', async () => {
      const { session, browser, cleanup } = await sandbox(
        next,
        new Map([
          [
            'node_modules/my-package/index.js',
            `
          const React = require('react')
          module.exports = React.createContext()
        `,
          ],
          [
            'node_modules/my-package/package.json',
            `
          {
            "name": "my-package",
            "version": "0.0.1"
          }
        `,
          ],
          [
            'app/page.js',
            `
        import Context from 'my-package'
        export default function Page() {
          return (
            <>
                <Context.Provider value="hello">
                    <h1>Page</h1>
                </Context.Provider>
            </>
          )
        }`,
          ],
        ])
      )

      // TODO-APP: currently requires a full reload because moving from a client component to a server component isn't causing a Fast Refresh yet.
      await browser.refresh()

      expect(await session.hasRedbox(true)).toBe(true)
      expect(await session.getRedboxSource(true)).toMatchSnapshot()
      expect(next.cliOutput).toContain(
        'createContext only works in Client Components'
      )

      await cleanup()
    })

    it('should show error when createContext is called in external package', async () => {
      const { session, browser, cleanup } = await sandbox(
        next,
        new Map([
          [
            'node_modules/my-package/index.js',
            `
          const { createContext } = require('react')
          module.exports = createContext()
        `,
          ],
          [
            'node_modules/my-package/package.json',
            `
          {
            "name": "my-package",
            "version": "0.0.1"
          }
        `,
          ],
          [
            'app/page.js',
            `
        import Context from 'my-package'
        export default function Page() {
          return (
            <>
                <Context.Provider value="hello">
                    <h1>Page</h1>
                </Context.Provider>
            </>
          )
        }`,
          ],
        ])
      )

      // TODO-APP: currently requires a full reload because moving from a client component to a server component isn't causing a Fast Refresh yet.
      await browser.refresh()

      expect(await session.hasRedbox(true)).toBe(true)
      expect(await session.getRedboxSource(true)).toMatchSnapshot()
      expect(next.cliOutput).toContain(
        'createContext only works in Client Components'
      )

      await cleanup()
    })
  })
})
