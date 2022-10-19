import path from 'path'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import webdriver from 'next-webdriver'

describe('app-dir create root layout', () => {
  const isDev = (global as any).isNextDev

  if (!isDev) {
    it('should only run in dev', () => {})
    return
  }

  if (process.env.NEXT_TEST_REACT_VERSION === '^17') {
    it('should skip for react v17', () => {})
    return
  }
  let next: NextInstance

  describe('page.js', () => {
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

      expect(await browser.elementById('page-text').text()).toBe('Hello world!')

      expect(next.cliOutput.slice(outputIndex)).toInclude(
        "appDir is enabled but you're missing a root layout, we created app/layout.js for you."
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

      expect(await browser.elementById('page-text').text()).toBe('Hello world!')

      expect(next.cliOutput.slice(outputIndex)).toInclude(
        "appDir is enabled but you're missing a root layout, we created app/layout.tsx for you."
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
})
