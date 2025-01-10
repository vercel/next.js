/* eslint-env jest */

import { join } from 'path'
import cheerio from 'cheerio'
import { writeFile, remove } from 'fs-extra'
import {
  renderViaHTTP,
  nextBuild,
  findPort,
  launchApp,
  killApp,
  File,
} from 'next-test-utils'

const appDir = join(__dirname, '..')
let appPort
let app
let output

const handleOutput = (msg) => {
  output += msg
}

async function get$(path, query, options) {
  const html = await renderViaHTTP(appPort, path, query, options)
  return cheerio.load(html)
}

describe('TypeScript Features', () => {
  describe('default behavior', () => {
    beforeAll(async () => {
      output = ''
      appPort = await findPort()
      app = await launchApp(appDir, appPort, {
        onStdout: handleOutput,
        onStderr: handleOutput,
      })
    })
    afterAll(() => killApp(app))

    it('should render the page', async () => {
      const $ = await get$('/hello')
      expect($('body').text()).toMatch(/Hello World/)
      expect($('body').text()).toMatch(/1000000000000/)
    })

    it('should render the cookies page', async () => {
      const $ = await get$('/ssr/cookies')
      expect($('#cookies').text()).toBe('{}')
    })

    it('should render the cookies page with cookies', async () => {
      const $ = await get$(
        '/ssr/cookies',
        {},
        {
          headers: {
            Cookie: 'key=value;',
          },
        }
      )
      expect($('#cookies').text()).toBe(`{"key":"value"}`)
    })

    it('should render the generics page', async () => {
      const $ = await get$('/generics')
      expect($('#value').text()).toBe('Hello World from Generic')
    })

    it('should render the angle bracket type assertions page', async () => {
      const $ = await get$('/angle-bracket-type-assertions')
      expect($('#value').text()).toBe('test')
    })

    // Turbopack has the correct behavior where `.ts` / `.tsx` is preferred over `.js` / `.jsx`. Webpack prefers `.js` / `.jsx`.
    ;(process.env.TURBOPACK ? it.skip : it)(
      'should resolve files in correct order',
      async () => {
        const $ = await get$('/hello')
        // eslint-disable-next-line jest/no-standalone-expect
        expect($('#imported-value').text()).toBe('OK')
      }
    )

    // old behavior:
    it.skip('should report type checking to stdout', async () => {
      expect(output).toContain('waiting for typecheck results...')
    })

    it('should respond to sync API route correctly', async () => {
      const data = JSON.parse(await renderViaHTTP(appPort, '/api/sync'))
      expect(data).toEqual({ code: 'ok' })
    })

    it('should respond to async API route correctly', async () => {
      const data = JSON.parse(await renderViaHTTP(appPort, '/api/async'))
      expect(data).toEqual({ code: 'ok' })
    })

    it('should not fail to render when an inactive page has an error', async () => {
      await killApp(app)
      let evilFile = join(appDir, 'pages', 'evil.tsx')
      try {
        await writeFile(
          evilFile,
          `import React from 'react'

export default function EvilPage(): JSX.Element {
  return <div notARealProp />
}
`
        )
        appPort = await findPort()
        app = await launchApp(appDir, appPort)

        const $ = await get$('/hello')
        expect($('body').text()).toMatch(/Hello World/)
      } finally {
        await remove(evilFile)
      }
    })
  })
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      it('should build the app', async () => {
        const output = await nextBuild(appDir, [], { stdout: true })
        expect(output.stdout).toMatch(/Compiled successfully/)
        expect(output.code).toBe(0)
      })

      it('should build the app with functions in next.config.js', async () => {
        const nextConfig = new File(join(appDir, 'next.config.js'))

        nextConfig.write(`
    module.exports = {
      webpack(config) { return config },
      onDemandEntries: {
        // Make sure entries are not getting disposed.
        maxInactiveAge: 1000 * 60 * 60,
      },
    }
    `)

        try {
          const output = await nextBuild(appDir, [], { stdout: true })

          expect(output.stdout).toMatch(/Compiled successfully/)
          expect(output.code).toBe(0)
        } finally {
          nextConfig.restore()
        }
      })

      it('should not inform when using default tsconfig path', async () => {
        const output = await nextBuild(appDir, [], { stdout: true })
        expect(output.stdout).not.toMatch(/Using tsconfig file:/)
      })

      describe('should compile with different types', () => {
        it('should compile async getInitialProps for _error', async () => {
          const errorPage = new File(join(appDir, 'pages/_error.tsx'))
          try {
            errorPage.replace('static ', 'static async ')
            const output = await nextBuild(appDir, [], { stdout: true })

            expect(output.stdout).toMatch(/Compiled successfully/)
          } finally {
            errorPage.restore()
          }
        })

        it('should compile sync getStaticPaths & getStaticProps', async () => {
          const page = new File(join(appDir, 'pages/ssg/[slug].tsx'))
          try {
            page.replace(/async \(/g, '(')
            const output = await nextBuild(appDir, [], { stdout: true })

            expect(output.stdout).toMatch(/Compiled successfully/)
          } finally {
            page.restore()
          }
        })
      })
    }
  )
})
