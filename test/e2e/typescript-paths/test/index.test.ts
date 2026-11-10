/* eslint-env jest */

import { join } from 'path'
import * as path from 'path'
import { nextTestSetup, type NextInstance } from 'e2e-utils'
import { File } from 'next-test-utils'
import * as JSON5 from 'json5'

function runTests(next: NextInstance) {
  describe('default behavior', () => {
    it('should alias components', async () => {
      const $ = await next.render$('/basic-alias')
      expect($('body').text()).toMatch(/World/)
    })

    it('should resolve the first item in the array first', async () => {
      const $ = await next.render$('/resolve-order')
      expect($('body').text()).toMatch(/Hello from a/)
    })

    it('should resolve the second item in as a fallback', async () => {
      const $ = await next.render$('/resolve-fallback')
      expect($('body').text()).toMatch(/Hello from only b/)
    })

    it('should resolve a single matching alias', async () => {
      const $ = await next.render$('/single-alias')
      expect($('body').text()).toMatch(/Hello/)
    })

    it('should not resolve to .d.ts files', async () => {
      const $ = await next.render$('/alias-to-d-ts')
      expect($('body').text()).toMatch(/Not aliased to d\.ts file/)
    })

    it('should handle typescript paths alias correctly', async () => {
      const html = await next.render('/button')
      expect(html).toContain('Hello')
    })
  })
}

describe('typescript paths', () => {
  const { next } = nextTestSetup({
    files: join(__dirname, '..'),
    dependencies: {
      // `baseUrl` is deprecated in TypeScript 6.
      typescript: '5.9.3',
    },
  })
  runTests(next)
})

const tsconfig = new File(path.resolve(__dirname, '../tsconfig.json'))

describe('typescript paths without baseurl', () => {
  beforeAll(async () => {
    const tsconfigContent = JSON5.parse(tsconfig.originalContent)
    delete tsconfigContent.compilerOptions.baseUrl
    tsconfigContent.compilerOptions.paths = {
      'isomorphic-unfetch': ['./types/unfetch.d.ts'],
      '@c/*': ['./components/*'],
      '@lib/*': ['./lib/a/*', './lib/b/*'],
      '@mycomponent': ['./components/hello.tsx'],
      'd-ts-alias': [
        './components/alias-to-d-ts.d.ts',
        './components/alias-to-d-ts.tsx',
      ],
    }
    tsconfig.write(JSON.stringify(tsconfigContent, null, 2))
  })

  afterAll(() => {
    tsconfig.restore()
  })

  const { next } = nextTestSetup({ files: join(__dirname, '..') })

  runTests(next)
})
