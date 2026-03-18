import { nextTestSetup } from 'e2e-utils'

// `resolveAlias: false` is a Turbopack-only feature. The `turbopack.resolveAlias`
// config is not read by webpack.
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'turbopack-resolve-alias-false',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
      skipDeployment: true,
    })

    describe('ESM static imports', () => {
      it('resolves namespace import (import * as ns) to {}', async () => {
        const response = JSON.parse(await next.render('/api/esm'))
        expect(response.namespaceImport).toEqual({})
      })

      it('resolves named import (import { foo }) to undefined', async () => {
        const response = JSON.parse(await next.render('/api/esm'))
        expect(response.namedImportIsUndefined).toBe(true)
      })

      it('resolves default import (import def) to undefined', async () => {
        const response = JSON.parse(await next.render('/api/esm'))
        expect(response.defaultImportIsUndefined).toBe(true)
      })
    })

    describe('dynamic import()', () => {
      it('resolves dynamic import to {}', async () => {
        const response = JSON.parse(await next.render('/api/dynamic'))
        expect(response.dynamicImport).toEqual({})
      })
    })

    describe('CommonJS require()', () => {
      it('resolves require() to {}', async () => {
        const response = JSON.parse(await next.render('/api/cjs'))
        expect(response.required).toEqual({})
      })
    })
  }
)
