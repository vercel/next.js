import { nextTestSetup } from 'e2e-utils'
import { execSync } from 'child_process'

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
      dependencies: { 'es-check': '9.5.3' },
      packageJson: {
        browserslist,
      },
    })

    it('should downlevel JS according to manual browserslist with es2020', () => {
      let esCheckOutput = execSync(
        'node_modules/.bin/es-check es2020 ".next/static/**/*.js"',
        { cwd: next.testDir }
      ).toString()

      expect(esCheckOutput).toContain('info: ✓ ES-Check passed!')
    })
  })

  describe('default browserslist', () => {
    let browserslist = ['chrome 111', 'edge 111', 'firefox 111', 'safari 16.4']

    const { next } = nextTestSetup({
      files: __dirname,
      dependencies: { 'es-check': '9.5.3' },
      packageJson: {
        browserslist,
      },
    })

    it('should downlevel JS according to default browserslist', () => {
      let esCheckOutput = execSync(
        `node_modules/.bin/es-check checkBrowser ".next/static/**/*.js" --browserslistQuery="${browserslist.join(', ')}"`,
        { cwd: next.testDir }
      ).toString()

      expect(esCheckOutput).toContain('info: ✓ ES-Check passed!')
    })
  })
})
