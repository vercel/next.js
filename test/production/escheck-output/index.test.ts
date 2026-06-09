import { nextTestSetup } from 'e2e-utils'
import { execSync } from 'child_process'

const dependencies = {
  'es-check': '9.6.4',
  browserslist: '4.28.1',
}

describe('escheck-output', () => {
  describe('es2020', () => {
    let browserslist = [
      'chrome 64',
      'edge 79',
      'firefox 67',
      'opera 51',
      'safari 12',
    ]
    const { next } = nextTestSetup({
      files: __dirname,
      dependencies,
      packageJson: {
        browserslist,
      },
    })

    it('should downlevel JS', () => {
      let esCheckOutput = execSync(
        'node_modules/.bin/es-check es2020 ".next/static/**/*.js" --noCache',
        { cwd: next.testDir, encoding: 'utf8' }
      )

      expect(esCheckOutput).toContain('info: ✓ ES-Check passed!')
    })
  })

  describe('default browserslist', () => {
    let browserslist = ['chrome 111', 'edge 111', 'firefox 111', 'safari 16.4']

    const { next } = nextTestSetup({
      files: __dirname,
      dependencies,
      packageJson: {
        browserslist,
      },
    })

    it('should downlevel JS', () => {
      let esCheckOutput = execSync(
        `node_modules/.bin/es-check checkBrowser ".next/static/**/*.js" --browserslistQuery="${browserslist.join(', ')}" --noCache`,
        { cwd: next.testDir, encoding: 'utf8' }
      )

      expect(esCheckOutput).toContain('info: ✓ ES-Check passed!')
    })
  })

  describe('nomodule browsers', () => {
    let browserslist = ['chrome 60']

    const { next } = nextTestSetup({
      files: __dirname,
      dependencies,
      packageJson: {
        browserslist,
      },
    })

    it('should downlevel JS', () => {
      let esCheckOutput = execSync(
        `node_modules/.bin/es-check checkBrowser ".next/static/**/*.js" --browserslistQuery="${browserslist.join(', ')}" --noCache`,
        { cwd: next.testDir, encoding: 'utf8' }
      )

      expect(esCheckOutput).toContain('info: ✓ ES-Check passed!')
    })
  })

  // Webpack doesn't properly downlevel
  ;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)('ancient', () => {
    let browserslist = ['ios >= 9']

    const { next } = nextTestSetup({
      files: __dirname,
      dependencies,
      packageJson: {
        browserslist,
      },
    })

    it('should downlevel JS', () => {
      let esCheckOutput = execSync(
        `node_modules/.bin/es-check checkBrowser ".next/static/**/*.js" --browserslistQuery="${browserslist.join(', ')}" --noCache`,
        { cwd: next.testDir, encoding: 'utf8' }
      )

      console.log(esCheckOutput)
      expect(esCheckOutput).toContain('info: ✓ ES-Check passed!')
    })
  })

  // Chrome 50 does not support async/await (added in Chrome 55).
  // This validates that TLA and async functions in app/tla.js and app/foo/page.js
  // are properly transpiled by SWC preset-env.
  // Webpack doesn't properly downlevel
  ;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
    'pre-async browsers',
    () => {
      let browserslist = ['chrome 50']

      const { next } = nextTestSetup({
        files: __dirname,
        dependencies,
        packageJson: {
          browserslist,
        },
      })

      it('should downlevel async/await', () => {
        let esCheckOutput = execSync(
          `node_modules/.bin/es-check checkBrowser ".next/static/**/*.js" --browserslistQuery="${browserslist.join(', ')}" --noCache`,
          { cwd: next.testDir, encoding: 'utf8' }
        )

        expect(esCheckOutput).toContain('info: ✓ ES-Check passed!')
      })

      it('should render TLA page correctly', async () => {
        const res = await next.fetch('/tla-page')
        expect(res.status).toBe(200)
        const html = await res.text()
        expect(html).toContain('loaded')
      })
    }
  )
})
