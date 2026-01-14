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

    it('should downlevel JS', () => {
      let esCheckOutput = execSync(
        'node_modules/.bin/es-check es2020 ".next/static/**/*.js"',
        { cwd: next.testDir }
      ).toString()

      expect(esCheckOutput).toContain('info: ✓ ES-Check passed!')
    })

    it('should not include outdated polyfills', async () => {
      expect(await detectPolyfills(next)).toEqual([
        'Symbol.prototype.description',
        'String.prototype.trimStart',
        'Array.prototype.at',
        'Array.prototype.flat',
        'Object.fromEntries',
        'Object.hasOwn',
        'URL.canParse',
      ])
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

    it('should downlevel JS', () => {
      let esCheckOutput = execSync(
        `node_modules/.bin/es-check checkBrowser ".next/static/**/*.js" --browserslistQuery="${browserslist.join(', ')}"`,
        { cwd: next.testDir }
      ).toString()

      expect(esCheckOutput).toContain('info: ✓ ES-Check passed!')
    })

    it('should not include outdated polyfills', async () => {
      expect(await detectPolyfills(next)).toEqual(['URL.canParse'])
    })
  })

  describe('nomodule browsers', () => {
    let browserslist = ['chrome 60']

    const { next } = nextTestSetup({
      files: __dirname,
      dependencies: { 'es-check': '9.5.3' },
      packageJson: {
        browserslist,
      },
    })

    // Fails due to https://github.com/yowainwright/es-check/issues/383
    it.skip('should downlevel JS', () => {
      let esCheckOutput = execSync(
        `node_modules/.bin/es-check checkBrowser ".next/static/**/*.js" --browserslistQuery="${browserslist.join(', ')}"`,
        { cwd: next.testDir, stdio: 'inherit' }
      ).toString()

      expect(esCheckOutput).toContain('info: ✓ ES-Check passed!')
    })

    it('should not include outdated polyfills', async () => {
      expect(await detectPolyfills(next)).toEqual([
        'Symbol.prototype.description',
        'String.prototype.trimStart',
        'Array.prototype.at',
        'Array.prototype.flat',
        'Object.fromEntries',
        'Object.hasOwn',
        'URL.canParse',
        'Object.assign',
        'Array.findIndex',
      ])
    })
  })
})

async function detectPolyfills(next) {
  const { polyfillFiles } = await next.readJSON('.next/build-manifest.json')

  const polyfills = {
    'Symbol.prototype.description': '"description"in Symbol.prototype',
    'String.prototype.trimStart': '"trimStart"in String.prototype',
    'Array.prototype.at': 'Array.prototype.at=',
    'Array.prototype.flat': 'Array.prototype.flat=',
    'Object.fromEntries': 'Object.fromEntries=',
    'Object.hasOwn': 'Object.hasOwn=',
    'URL.canParse': 'URL.canParse=',
    'Object.assign': 'Object.assign=',
    'Array.findIndex': 'Maximum allowed index exceeded',
  }

  let foundPolyfills = new Set()

  for (let file of polyfillFiles) {
    let content = await next.readFile(`.next/${file}`)
    for (let [name, matcher] of Object.entries(polyfills)) {
      if (content.includes(matcher)) {
        foundPolyfills.add(name)
      }
    }
  }

  return [...foundPolyfills]
}
