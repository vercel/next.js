import path from 'path'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import webdriver from 'next-webdriver'

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
              'app/page.js': new FileRef(
                path.join(__dirname, 'create-root-layout/app/page.js')
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
            'Hello world!'
          )

          expect(next.cliOutput.slice(outputIndex)).toInclude(
            'Your page app/page.js did not have a root layout, we created app/layout.js for you.'
          )

          expect(await next.readFile('app/layout.js')).toMatchInlineSnapshot(`
        "export default function RootLayout({ children }) {
          return (
            <html>
              <head></head>
              <body>{children}</body>
            </html>
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
          const browser = await webdriver(next.url, '/path2')

          expect(await browser.elementById('page-text').text()).toBe(
            'Hello world 2'
          )

          expect(next.cliOutput.slice(outputIndex)).toInclude(
            'Your page app/(group2)/path2/page.js did not have a root layout, we created app/(group2)/layout.js for you.'
          )

          expect(await next.readFile('app/(group2)/layout.js'))
            .toMatchInlineSnapshot(`
        "export default function RootLayout({ children }) {
          return (
            <html>
              <head></head>
              <body>{children}</body>
            </html>
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
              path.join(__dirname, 'create-root-layout/app/page.js')
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

        expect(next.cliOutput.slice(outputIndex)).toInclude(
          'Your page app/page.tsx did not have a root layout, we created app/layout.tsx for you.'
        )

        expect(await next.readFile('app/layout.tsx')).toMatchInlineSnapshot(`
        "export default function RootLayout({
          children,
        }: {
          children: React.ReactNode
        }) {
          return (
            <html>
              <head></head>
              <body>{children}</body>
            </html>
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
              path.join(__dirname, 'create-root-layout/app/page.js')
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
