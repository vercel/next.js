/* eslint-env jest */

import { join } from 'path'
import { nextTestSetup, isNextDev } from 'e2e-utils'
import { readFileSync, writeFileSync } from 'fs'

describe('TypeScript Features', () => {
  describe.each([
    { label: '', testBaseUrl: true },
    { label: ' without baseUrl', testBaseUrl: false },
  ])('default behavior$label', ({ testBaseUrl }) => {
    const tsConfigPath = join(__dirname, '../../../tsconfig.json')
    let previousTsConfigJsonc: string | null = null
    beforeAll(async () => {
      if (testBaseUrl) {
        previousTsConfigJsonc = readFileSync(tsConfigPath, 'utf-8')

        const nextTsConfigJsonc = previousTsConfigJsonc
          .replace('// baseUrl will go here', '"baseUrl": ".",')
          .replace(
            './packages/www/types/unfetch.d.ts',
            'packages/www/types/unfetch.d.ts'
          )
          .replace('./packages/www/components/*', 'packages/www/components/*')
          .replace('./packages/lib/a/*', 'packages/lib/a/*')
          .replace('./packages/lib/b/*', 'packages/lib/b/*')
          .replace(
            './packages/www/components/hello.tsx',
            'packages/www/components/hello.tsx'
          )
          .replace(
            './packages/www/components/alias-to-d-ts.d.ts',
            'packages/www/components/alias-to-d-ts.d.ts'
          )
          .replace(
            './packages/www/components/alias-to-d-ts.tsx',
            'packages/www/components/alias-to-d-ts.tsx'
          )
        writeFileSync(tsConfigPath, nextTsConfigJsonc)
      }
    })

    afterAll(() => {
      if (previousTsConfigJsonc !== null) {
        writeFileSync(tsConfigPath, previousTsConfigJsonc)
      }
    })

    const { next } = nextTestSetup({
      skipDeployment: true,
      dependencies: testBaseUrl
        ? {
            typescript: '5.9.3',
          }
        : undefined,
      files: join(__dirname, '../../../'),
      buildCommand: 'pnpm next build packages/www',
      startCommand:
        'pnpm next ' + (isNextDev ? 'dev' : 'start') + ' packages/www',
    })

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
  })
})
