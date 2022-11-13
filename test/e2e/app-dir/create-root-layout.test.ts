import path from 'path'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import webdriver from 'next-webdriver'
import { check } from 'next-test-utils'

describe('app-dir create root layout', () => {
  const isDev = (global as any).isNextDev

  if ((global as any).isNextDeploy) {
    it('should skip next deploy for now', () => {})
    return
  }

  if (process.env.NEXT_TEST_REACT_VERSION === '^17') {
    it('should skip for react v17', () => {})
    return
  }
  let next: NextInstance

  if (isDev) {
    describe('page.js', () => {
      describe('root layout in app', () => {
        beforeAll(async () => {
          next = await createNext({
            files: {
              app: new FileRef(path.join(__dirname, 'create-root-layout/app')),
              'next.config.js': new FileRef(
                path.join(__dirname, 'create-root-layout/next.config.js')
              ),
            },
            dependencies: {
              react: 'experimental',
              'react-dom': 'experimental',
            },
          })
        })
        afterAll(() => next.destroy())

        it('create root layout', async () => {
          const outputIndex = next.cliOutput.length
          const browser = await webdriver(next.url, '/route')

          expect(await browser.elementById('page-text').text()).toBe(
            'Hello world!'
          )

          await check(
            () => next.cliOutput.slice(outputIndex),
            /did not have a root layout/
          )
          expect(next.cliOutput.slice(outputIndex)).toMatch(
            'Your page app/route/page.js did not have a root layout. We created app/layout.js and app/head.js for you.'
          )

          expect(await next.readFile('app/layout.js')).toMatchInlineSnapshot(`
                    "export default function RootLayout({ children }) {
                      return (
                        <html>
                          <head />
                          <body>{children}</body>
                        </html>
                      )
                    }
                    "
                `)

          expect(await next.readFile('app/head.js')).toMatchInlineSnapshot(`
            "export default function Head() {
              return (
                <>
                  <title></title>
                  <meta content=\\"width=device-width, initial-scale=1\\" name=\\"viewport\\" />
                  <link rel=\\"icon\\" href=\\"/favicon.ico\\" />
                </>
              )
            }
            "
          `)
        })
      })

      describe('root layout in route group', () => {
        beforeAll(async () => {
          next = await createNext({
            files: {
              app: new FileRef(
                path.join(__dirname, 'create-root-layout/app-group-layout')
              ),
              'next.config.js': new FileRef(
                path.join(__dirname, 'create-root-layout/next.config.js')
              ),
            },
            dependencies: {
              react: 'experimental',
              'react-dom': 'experimental',
            },
          })
        })
        afterAll(() => next.destroy())

        it('create root layout', async () => {
          const outputIndex = next.cliOutput.length
          const browser = await webdriver(next.url, '/')

          expect(await browser.elementById('page-text').text()).toBe(
            'Hello world'
          )

          await check(
            () => next.cliOutput.slice(outputIndex),
            /did not have a root layout/
          )
          expect(next.cliOutput.slice(outputIndex)).toInclude(
            'Your page app/(group)/page.js did not have a root layout. We created app/(group)/layout.js and app/(group)/head.js for you.'
          )

          expect(await next.readFile('app/(group)/layout.js'))
            .toMatchInlineSnapshot(`
                    "export default function RootLayout({ children }) {
                      return (
                        <html>
                          <head />
                          <body>{children}</body>
                        </html>
                      )
                    }
                    "
                `)

          expect(await next.readFile('app/(group)/head.js'))
            .toMatchInlineSnapshot(`
            "export default function Head() {
              return (
                <>
                  <title></title>
                  <meta content=\\"width=device-width, initial-scale=1\\" name=\\"viewport\\" />
                  <link rel=\\"icon\\" href=\\"/favicon.ico\\" />
                </>
              )
            }
            "
          `)
        })
      })

      describe('find available dir', () => {
        beforeAll(async () => {
          next = await createNext({
            files: {
              app: new FileRef(
                path.join(
                  __dirname,
                  'create-root-layout/app-find-available-dir'
                )
              ),
              'next.config.js': new FileRef(
                path.join(__dirname, 'create-root-layout/next.config.js')
              ),
            },
            dependencies: {
              react: 'experimental',
              'react-dom': 'experimental',
            },
          })
        })
        afterAll(() => next.destroy())

        it('create root layout', async () => {
          const outputIndex = next.cliOutput.length
          const browser = await webdriver(next.url, '/route/second/inner')

          expect(await browser.elementById('page-text').text()).toBe(
            'Hello world'
          )

          await check(
            () => next.cliOutput.slice(outputIndex),
            /did not have a root layout/
          )
          expect(next.cliOutput.slice(outputIndex)).toInclude(
            'Your page app/(group)/route/second/inner/page.js did not have a root layout. We created app/(group)/route/second/layout.js and app/(group)/route/second/head.js for you.'
          )

          expect(await next.readFile('app/(group)/route/second/layout.js'))
            .toMatchInlineSnapshot(`
                    "export default function RootLayout({ children }) {
                      return (
                        <html>
                          <head />
                          <body>{children}</body>
                        </html>
                      )
                    }
                    "
                `)

          expect(await next.readFile('app/(group)/route/second/head.js'))
            .toMatchInlineSnapshot(`
            "export default function Head() {
              return (
                <>
                  <title></title>
                  <meta content=\\"width=device-width, initial-scale=1\\" name=\\"viewport\\" />
                  <link rel=\\"icon\\" href=\\"/favicon.ico\\" />
                </>
              )
            }
            "
          `)
        })
      })
    })

    describe('page.tsx', () => {
      beforeAll(async () => {
        next = await createNext({
          files: {
            'app/page.tsx': new FileRef(
              path.join(__dirname, 'create-root-layout/app/route/page.js')
            ),
            'next.config.js': new FileRef(
              path.join(__dirname, 'create-root-layout/next.config.js')
            ),
          },
          dependencies: {
            react: 'experimental',
            'react-dom': 'experimental',
            typescript: 'latest',
            '@types/react': 'latest',
            '@types/node': 'latest',
          },
        })
      })
      afterAll(() => next.destroy())

      it('create root layout', async () => {
        const outputIndex = next.cliOutput.length
        const browser = await webdriver(next.url, '/')

        expect(await browser.elementById('page-text').text()).toBe(
          'Hello world!'
        )

        await check(
          () => next.cliOutput.slice(outputIndex),
          /did not have a root layout/
        )
        expect(next.cliOutput.slice(outputIndex)).toInclude(
          'Your page app/page.tsx did not have a root layout. We created app/layout.tsx and app/head.tsx for you.'
        )

        expect(await next.readFile('app/layout.tsx')).toMatchInlineSnapshot(`
                  "export default function RootLayout({
                    children,
                  }: {
                    children: React.ReactNode
                  }) {
                    return (
                      <html>
                        <head />
                        <body>{children}</body>
                      </html>
                    )
                  }
                  "
              `)

        expect(await next.readFile('app/head.tsx')).toMatchInlineSnapshot(`
          "export default function Head() {
            return (
              <>
                <title></title>
                <meta content=\\"width=device-width, initial-scale=1\\" name=\\"viewport\\" />
                <link rel=\\"icon\\" href=\\"/favicon.ico\\" />
              </>
            )
          }
          "
        `)
      })
    })
  } else {
    describe('build', () => {
      it('should break the build if a page is missing root layout', async () => {
        const next = await createNext({
          skipStart: true,
          files: {
            'app/page.js': new FileRef(
              path.join(__dirname, 'create-root-layout/app/route/page.js')
            ),
            'next.config.js': new FileRef(
              path.join(__dirname, 'create-root-layout/next.config.js')
            ),
          },
          dependencies: {
            react: 'experimental',
            'react-dom': 'experimental',
          },
        })

        await expect(next.start()).rejects.toThrow('next build failed')
        expect(next.cliOutput).toInclude(
          "page.js doesn't have a root layout. To fix this error, make sure every page has a root layout."
        )
        await next.destroy()
      })
    })
  }
})
