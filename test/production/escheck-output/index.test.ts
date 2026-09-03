import { nextTestSetup } from 'e2e-utils'
import { execSync } from 'child_process'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import ts from 'typescript'

const dependencies = {
  'es-check': '9.6.4',
  browserslist: '4.28.1',
}

function findJsFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)

    if (entry.isDirectory()) {
      return findJsFiles(path)
    }

    return path.endsWith('.js') ? [path] : []
  })
}

function hasArrowFunction(source: string): boolean {
  const sourceFile = ts.createSourceFile(
    'output.js',
    source,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.JS
  )
  let found = false

  function visit(node: ts.Node) {
    if (found) {
      return
    }

    if (ts.isArrowFunction(node)) {
      found = true
      return
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return found
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

      const filesWithArrowFunctions = findJsFiles(
        join(next.testDir, '.next/static')
      ).filter((path) => hasArrowFunction(readFileSync(path, 'utf8')))

      expect(filesWithArrowFunctions).toEqual([])
    })
  })
})
