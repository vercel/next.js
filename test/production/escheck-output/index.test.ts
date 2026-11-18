import { nextTestSetup, type NextInstance } from 'e2e-utils'
import { execSync } from 'child_process'
import fs from 'fs/promises'
import path from 'path'

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

    // Webpack always includes all polyfills.
    // @force-gate turbopack
    it('should only include the needed polyfills', async () => {
      expect(await detectPolyfills(next)).toEqual(ALL_MODULE_POLYFILLS)
      expect(await getPolyfillFiles(next)).toEqual([])
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

    // Webpack always includes all polyfills.
    // @force-gate turbopack
    it('should only include the needed polyfills', async () => {
      expect(await detectPolyfills(next)).toEqual(['URL.canParse'])
      expect(await getPolyfillFiles(next)).toEqual([])
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

    // Webpack always includes all polyfills.
    // @force-gate turbopack
    it('should include the module and the nomodule polyfills', async () => {
      expect(await detectPolyfills(next)).toEqual([
        ...ALL_MODULE_POLYFILLS,
        ...NOMODULE_POLYFILLS,
      ])
      expect(await getPolyfillFiles(next)).toHaveLength(1)
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

    it('should include the module and the nomodule polyfills', async () => {
      expect(await detectPolyfills(next)).toEqual([
        ...ALL_MODULE_POLYFILLS,
        ...NOMODULE_POLYFILLS,
      ])
      expect(await getPolyfillFiles(next)).toHaveLength(1)
    })
  })
})

const POLYFILL_MARKERS = {
  'Symbol.prototype.description':
    'Object.defineProperty(Symbol.prototype,"description"',
  'String.prototype.trimStart': 'String.prototype.trimStart=',
  'Array.prototype.at': 'Array.prototype.at=',
  'Array.prototype.flat': 'Array.prototype.flat=',
  'Object.fromEntries': 'Object.fromEntries=',
  'Object.hasOwn': 'Object.hasOwn=',
  'URL.canParse': 'URL.canParse=',
  // Only in polyfill-nomodule
  'Object.assign': 'Object.assign=',
  'Array.findIndex': 'Maximum allowed index exceeded',
}

const ALL_MODULE_POLYFILLS = [
  'Symbol.prototype.description',
  'String.prototype.trimStart',
  'Array.prototype.at',
  'Array.prototype.flat',
  'Object.fromEntries',
  'Object.hasOwn',
  'URL.canParse',
]
const NOMODULE_POLYFILLS = ['Object.assign', 'Array.findIndex']

/** The polyfill files that are loaded with `<script nomodule>`. */
async function getPolyfillFiles(next: NextInstance): Promise<string[]> {
  const { polyfillFiles } = await next.readJSON('.next/build-manifest.json')
  return polyfillFiles
}

/** Which polyfills are part of any of the emitted client JavaScript files. */
async function detectPolyfills(next: NextInstance): Promise<string[]> {
  const staticDir = path.join(next.testDir, '.next/static')
  const files = (await fs.readdir(staticDir, { recursive: true })).filter(
    (file) => file.endsWith('.js')
  )

  const found = new Set<string>()
  for (const file of files) {
    const content = await fs.readFile(path.join(staticDir, file), 'utf8')
    for (const [name, marker] of Object.entries(POLYFILL_MARKERS)) {
      if (content.includes(marker)) {
        found.add(name)
      }
    }
  }

  // Report in a stable order.
  return Object.keys(POLYFILL_MARKERS).filter((name) => found.has(name))
}
