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

    it('should not include outdated polyfills', async () => {
      expect(await detectPolyfills(next)).toEqual(['URL.canParse'])
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
})

async function detectPolyfills(next) {
  const { polyfillFiles } = await next.readJSON('.next/build-manifest.json')

  const polyfills = {
    'Symbol.prototype.description':
      'Object.defineProperty(Symbol.prototype,"description"',
    'String.prototype.trimStart': 'String.prototype.trimStart=',
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
